import { Events, ChatInputCommandInteraction, ButtonInteraction } from "discord.js";
import { createLogger } from "../utils/logger.js";
import { handlePanelButton } from "../panel/index.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../utils/embed.js";
import type { KoesuClient } from "../client.js";

const log = createLogger("interactionCreate");

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(client: KoesuClient, interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        log.warn(`Comando no encontrado: ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (err) {
        log.error({ err }, `Error ejecutando comando: ${interaction.commandName}`);
        const msg = { content: "Ocurrio un error ejecutando este comando.", ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg);
        } else {
          await interaction.reply(msg);
        }
      }
      return;
    }

    if (interaction.isButton()) {
      const [prefix, action] = interaction.customId.split(":");

      if (prefix === "panel") {
        await interaction.deferReply({ ephemeral: true });
        const guildId = interaction.guildId as string;
        const result = await handlePanelButton(
          client,
          guildId,
          interaction.user.id,
          action,
          interaction.message
        );
        await interaction.editReply({
          embeds: [buildSuccessEmbed(result)],
        });
        return;
      }

      if (prefix === "queue") {
        const [, dir, pageStr] = interaction.customId.split(":");
        const page = parseInt(pageStr) + (dir === "next" ? 1 : -1);
        const player = client.lavalink.getPlayer(interaction.guildId as string);
        if (!player) { await interaction.update({ content: "No hay musica", embeds: [], components: [] }); return; }
        const guildConfig = await client.prisma.guild.findUnique({ where: { id: interaction.guildId as string } });
        const config = { color: guildConfig?.panelColor ?? "#5865F2", title: guildConfig?.panelTitle ?? "Koesu Music", footer: guildConfig?.panelFooter ?? "Koesu", thumbnail: guildConfig?.panelThumbnail ?? true };
        const { buildQueueEmbed } = await import("../utils/embed.js");
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
        const embed = buildQueueEmbed(player.queue.tracks as any, player.queue.current, config, page);
        const totalPages = Math.ceil(player.queue.tracks.length / 10);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`queue:prev:${page}`).setLabel("Anterior").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
          new ButtonBuilder().setCustomId(`queue:next:${page}`).setLabel("Siguiente").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
        );
        await interaction.update({ embeds: [embed], components: [row as any] });
        return;
      }
    }
  },
};
