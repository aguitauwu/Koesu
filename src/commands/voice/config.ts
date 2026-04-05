import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("voice-config")
    .setDescription("Configura los canales de voz temporales del servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName("nombre").setDescription("Formato del nombre del canal (usa {user})").setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName("inactividad").setDescription("Segundos de inactividad por defecto").setMinValue(0).setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("bienvenida").setDescription("Mensaje de bienvenida por defecto").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    const nombre = interaction.options.getString("nombre");
    const inactividad = interaction.options.getInteger("inactividad");
    const bienvenida = interaction.options.getString("bienvenida");

    const data: Record<string, unknown> = {};
    if (nombre !== null) data.name = nombre;
    if (inactividad !== null) data.inactiveTimeout = inactividad;
    if (bienvenida !== null) data.welcomeMessage = bienvenida;

    await client.prisma.voiceChannelConfig.upsert({
      where: { id: guildId },
      create: { guildId, ...data },
      update: data,
    });

    await interaction.editReply({
      embeds: [buildSuccessEmbed("Configuracion de canales de voz actualizada")],
    });
  },
};
