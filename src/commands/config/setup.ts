import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configura Koesu en este servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName("prefix").setDescription("Prefijo del bot").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("nombre").setDescription("Nombre del bot en este servidor").setRequired(false)
    )
    .addRoleOption((opt) =>
      opt.setName("dj").setDescription("Rol DJ").setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName("volumen").setDescription("Volumen por defecto (0-100)").setMinValue(0).setMaxValue(100).setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName("limite").setDescription("Limite de canciones por usuario en cola (0 = ilimitado)").setMinValue(0).setRequired(false)
    )
    .addNumberOption((opt) =>
      opt.setName("voto").setDescription("Ratio para vote skip (0.1 - 1.0)").setMinValue(0.1).setMaxValue(1.0).setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("webhook").setDescription("URL del webhook para notificaciones").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;

    await interaction.deferReply({ ephemeral: true });

    const prefix = interaction.options.getString("prefix");
    const nombre = interaction.options.getString("nombre");
    const djRole = interaction.options.getRole("dj");
    const volumen = interaction.options.getInteger("volumen");
    const limite = interaction.options.getInteger("limite");
    const voto = interaction.options.getNumber("voto");
    const webhook = interaction.options.getString("webhook");

    const data: Record<string, unknown> = {};
    if (prefix !== null) data.prefix = prefix;
    if (nombre !== null) data.botName = nombre;
    if (djRole !== null) data.djRoleId = djRole.id;
    if (volumen !== null) data.volume = volumen;
    if (limite !== null) data.maxQueuePerUser = limite;
    if (voto !== null) data.voteSkipRatio = voto;
    if (webhook !== null) data.webhookUrl = webhook;

    const guildId = interaction.guildId as string;

    await client.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId, ...data },
      update: data,
    });

    await interaction.editReply({
      embeds: [buildSuccessEmbed("Configuracion actualizada")],
    });
  },
};
