import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { buildErrorEmbed } from "../../utils/embed.js";
import { scan } from "../../ytdlp/client.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("set-files")
    .setDescription("Muestra y configura la musica local disponible")
    .addStringOption((opt) =>
      opt.setName("dir").setDescription("Carpeta de musica (opcional)").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;

    await interaction.deferReply({ ephemeral: true });

    const dir = interaction.options.getString("dir") ?? process.env.MUSIC_DIR ?? "/root/musica";
    const tracks = await scan(dir);

    if (tracks.length === 0) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(`No se encontraron canciones en ${dir}`)],
      });
      return;
    }

    const perPage = 10;
    const totalPages = Math.ceil(tracks.length / perPage);
    const page = 1;
    const slice = tracks.slice(0, perPage);

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("Musica local disponible")
      .setDescription(slice.map((t, i) => `${i + 1}. ${t.title}`).join("\n"))
      .setFooter({ text: `Pagina ${page}/${totalPages} • ${tracks.length} canciones • ${dir}` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("files:confirm")
        .setLabel("Usar esta carpeta")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("files:cancel")
        .setLabel("Cancelar")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
