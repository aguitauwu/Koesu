import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import { buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("voice-create")
    .setDescription("Crea un canal de voz temporal")
    .addStringOption((opt) =>
      opt.setName("nombre").setDescription("Nombre del canal (usa {user})").setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName("limite").setDescription("Limite de usuarios").setMinValue(1).setMaxValue(99).setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName("inactividad").setDescription("Segundos de inactividad antes de expulsar").setMinValue(0).setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("bienvenida").setDescription("Mensaje de bienvenida al entrar").setRequired(false)
    )
    .addRoleOption((opt) =>
      opt.setName("rol").setDescription("Rol requerido para entrar").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("playlist").setDescription("Playlist a reproducir automaticamente").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    const nombre = interaction.options.getString("nombre") ?? "vocal de {user}";
    const limite = interaction.options.getInteger("limite") ?? 0;
    const inactividad = interaction.options.getInteger("inactividad") ?? 300;
    const bienvenida = interaction.options.getString("bienvenida");
    const rol = interaction.options.getRole("rol");
    const playlistNombre = interaction.options.getString("playlist");

    await client.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });

    let playlistId: string | undefined;
    if (playlistNombre) {
      const playlist = await client.prisma.playlist.findFirst({
        where: {
          name: playlistNombre,
          OR: [{ userId: member.id }, { guildId }],
        },
      });
      if (playlist) playlistId = playlist.id;
    }

    const channelName = nombre.replace("{user}", member.displayName);

    const voiceChannel = await interaction.guild?.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      userLimit: limite,
      permissionOverwrites: [
        {
          id: guildId,
          allow: rol ? [] : [PermissionFlagsBits.Connect],
          deny: rol ? [PermissionFlagsBits.Connect] : [],
        },
        ...(rol ? [{ id: rol.id, allow: [PermissionFlagsBits.Connect] }] : []),
        {
          id: member.id,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels],
        },
      ],
    });

    if (!voiceChannel) return;

    await client.prisma.voiceChannelConfig.create({
      data: {
        guildId,
        channelId: voiceChannel.id,
        name: nombre,
        allowedRoles: JSON.stringify(rol ? [rol.id] : []),
        inactiveTimeout: inactividad,
        welcomeMessage: bienvenida,
        playlistId: playlistId ?? null,
      },
    });

    if (inactividad > 0) {
      scheduleInactivityCheck(client, voiceChannel.id, guildId, inactividad);
    }

    await interaction.editReply({
      embeds: [buildSuccessEmbed(`Canal de voz **${channelName}** creado`)],
    });
  },
};

function scheduleInactivityCheck(
  client: KoesuClient,
  channelId: string,
  guildId: string,
  timeout: number
): void {
  const interval = setInterval(async () => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) { clearInterval(interval); return; }

    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isVoiceBased()) { clearInterval(interval); return; }

    const members = channel.members.filter((m) => !m.user.bot);
    if (members.size === 0) {
      await channel.delete().catch(() => null);
      await client.prisma.voiceChannelConfig.deleteMany({ where: { channelId } });
      clearInterval(interval);
      return;
    }

    for (const [, m] of members) {
      if (!m.voice.selfVideo) {
        await m.voice.disconnect().catch(() => null);
      }
    }
  }, timeout * 1000);
}
