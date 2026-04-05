import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("lastfm-verify")
    .setDescription("Verifica tu cuenta de Last.fm despues de autorizar"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;

    await interaction.deferReply({ ephemeral: true });

    const success = await client.lastfm.connectSession(interaction.user.id);

    if (!success) {
      await interaction.editReply({
        embeds: [buildErrorEmbed("No se pudo conectar. Asegurate de haber autorizado primero con /lastfm-connect")],
      });
      return;
    }

    await interaction.editReply({
      embeds: [buildSuccessEmbed("Last.fm conectado. Tus canciones seran scrobbleadas automaticamente.")],
    });
  },
};
