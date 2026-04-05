import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import { isDJ, isInVoice, isSameVoice, canVoteSkip } from "../../utils/permissions.js";
import { updatePanel } from "../../panel/index.js";
import type { KoesuClient } from "../../client.js";

const voteSkipMap = new Map<string, Set<string>>();

export default {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Salta la cancion actual o vota para saltarla"),

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

    const player = client.lavalink.getPlayer(guildId);
    if (!player) {
      await interaction.editReply({ embeds: [buildErrorEmbed("No hay musica reproduciendose")] });
      return;
    }

    const dj = await isDJ(member, client);

    if (dj) {
      const title = player.queue.current?.info.title ?? "cancion actual";
      await player.skip();
      await updatePanel(client, guildId, player.queue.current);
      await interaction.editReply({ embeds: [buildSuccessEmbed(`Saltado: **${title}**`)] });
      return;
    }

    const { can, required } = await canVoteSkip(member, client);
    if (!can) {
      await interaction.editReply({ embeds: [buildErrorEmbed("No se puede votar ahora")] });
      return;
    }

    const key = `${guildId}:${player.queue.current?.encoded}`;
    if (!voteSkipMap.has(key)) voteSkipMap.set(key, new Set());
    const votes = voteSkipMap.get(key) as Set<string>;
    votes.add(member.id);

    if (votes.size >= required) {
      voteSkipMap.delete(key);
      const title = player.queue.current?.info.title ?? "cancion actual";
      await player.skip();
      await updatePanel(client, guildId, player.queue.current);
      await interaction.editReply({ embeds: [buildSuccessEmbed(`Voto exitoso. Saltado: **${title}**`)] });
    } else {
      await interaction.editReply({
        embeds: [buildSuccessEmbed(`Voto registrado: ${votes.size}/${required}`)],
      });
    }
  },
};
