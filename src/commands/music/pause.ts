import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import { isDJ, isInVoice, isSameVoice } from "../../utils/permissions.js";
import { updatePanel } from "../../panel/index.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pausa o reanuda la reproduccion"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    if (!await isInVoice(member)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Debes estar en un canal de voz")] });
      return;
    }

    if (!await isSameVoice(member, client)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Debes estar en el mismo canal de voz que el bot")] });
      return;
    }

    if (!await isDJ(member, client)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Necesitas el rol DJ")] });
      return;
    }

    const player = client.lavalink.getPlayer(guildId);
    if (!player) {
      await interaction.editReply({ embeds: [buildErrorEmbed("No hay musica reproduciendose")] });
      return;
    }

    await player.pause();
    await updatePanel(client, guildId, player.queue.current);

    await interaction.editReply({
      embeds: [buildSuccessEmbed(player.paused ? "Pausado" : "Reanudado")],
    });
  },
};
