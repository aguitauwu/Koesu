import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("lastfm-disconnect")
    .setDescription("Desconecta tu cuenta de Last.fm"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;

    await interaction.deferReply({ ephemeral: true });

    client.lastfm.removeSession(interaction.user.id);

    await interaction.editReply({
      embeds: [buildSuccessEmbed("Last.fm desconectado")],
    });
  },
};
