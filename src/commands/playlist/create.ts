import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("playlist-create")
    .setDescription("Crea una playlist")
    .addStringOption((opt) =>
      opt.setName("nombre").setDescription("Nombre de la playlist").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("tipo")
        .setDescription("Tipo de playlist")
        .setRequired(true)
        .addChoices(
          { name: "Personal", value: "PERSONAL" },
          { name: "Servidor", value: "SERVER" },
          { name: "Canal", value: "CHANNEL" }
        )
    )
    .addBooleanOption((opt) =>
      opt.setName("publica").setDescription("Hacer la playlist publica").setRequired(false)
    )
    .addChannelOption((opt) =>
      opt.setName("canal").setDescription("Canal de voz (solo para tipo Canal)").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ embeds: [buildErrorEmbed("Este comando solo funciona en servidores")] });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const nombre = interaction.options.getString("nombre", true);
    const tipo = interaction.options.getString("tipo", true) as "PERSONAL" | "SERVER" | "CHANNEL";
    const publica = interaction.options.getBoolean("publica") ?? false;
    const canal = interaction.options.getChannel("canal");

    const existing = await client.prisma.playlist.findFirst({
      where: {
        name: nombre,
        type: tipo,
        ...(tipo === "PERSONAL" ? { userId: member.id } : { guildId }),
      },
    });

    if (existing) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(`Ya existe una playlist llamada **${nombre}**`)],
      });
      return;
    }

    await client.prisma.user.upsert({
      where: { id: member.id },
      create: { id: member.id },
      update: {},
    });

    await client.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });

    await client.prisma.playlist.create({
      data: {
        name: nombre,
        type: tipo,
        isPublic: publica,
        ...(tipo === "PERSONAL" ? { userId: member.id } : { guildId }),
        ...(tipo === "CHANNEL" && canal ? { channelId: canal.id } : {}),
      },
    });

    await interaction.editReply({
      embeds: [buildSuccessEmbed(`Playlist **${nombre}** creada`)],
    });
  },
};
