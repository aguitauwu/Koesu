import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("lastfm-connect")
    .setDescription("Conecta tu cuenta de Last.fm para scrobbling automatico"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;

    await interaction.deferReply({ ephemeral: true });

    if (!process.env.LASTFM_API_KEY) {
      await interaction.editReply({
        embeds: [buildErrorEmbed("Last.fm no esta configurado en este bot")],
      });
      return;
    }

    const url = await client.lastfm.getAuthUrl(interaction.user.id);

    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          `Autoriza a Koesu en Last.fm:\n\n${url}\n\nDespues usa /lastfm-verify para completar la conexion.`
        ),
      ],
    });
  },
};
