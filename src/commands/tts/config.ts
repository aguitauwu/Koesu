import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tts-config")
    .setDescription("Configura el TTS del servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName("url").setDescription("URL base de la API TTS").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("apikey").setDescription("API key del servicio TTS").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("voz").setDescription("Voz por defecto").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    const url = interaction.options.getString("url");
    const apikey = interaction.options.getString("apikey");
    const voz = interaction.options.getString("voz");

    const data: Record<string, unknown> = {};
    if (url) data.ttsApiUrl = url;
    if (apikey) data.ttsApiKey = apikey;
    if (voz) data.ttsVoice = voz;

    await client.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId, ...data },
      update: data,
    });

    await interaction.editReply({
      embeds: [buildSuccessEmbed("Configuracion TTS actualizada")],
    });
  },
};
