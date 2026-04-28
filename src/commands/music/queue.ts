import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { buildErrorEmbed, buildQueueEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Muestra la cola de reproduccion")
    .addIntegerOption((opt) =>
      opt.setName("pagina").setDescription("Numero de pagina").setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId;
    const page = interaction.options.getInteger("pagina") ?? 1;

    await interaction.deferReply({ ephemeral: true });

    if (!guildId) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Este comando solo funciona en servidores")] });
      return;
    }

    const player = client.lavalink.getPlayer(guildId);
    if (!player) {
      await interaction.editReply({ embeds: [buildErrorEmbed("No hay musica reproduciendose")] });
      return;
    }

    const guildConfig = await client.prisma.guild.findUnique({
      where: { id: guildId },
    });

    const config = {
      color: guildConfig?.panelColor ?? "#5865F2",
      title: guildConfig?.panelTitle ?? "Koesu Music",
      footer: guildConfig?.panelFooter ?? "Koesu",
      thumbnail: guildConfig?.panelThumbnail ?? true,
    };

    const embed = buildQueueEmbed(
      (player.queue.tracks as any[]),
      player.queue.current,
      config,
      page
    );

    const totalPages = Math.ceil(player.queue.tracks.length / 10);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue:prev:${page}`)
        .setLabel("Anterior")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`queue:next:${page}`)
        .setLabel("Siguiente")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
