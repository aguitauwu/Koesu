import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import { isInVoice } from "../../utils/permissions.js";
import { updatePanel } from "../../panel/index.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("playlist-play")
    .setDescription("Reproduce una playlist")
    .addStringOption((opt) =>
      opt.setName("nombre").setDescription("Nombre de la playlist").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    if (!await isInVoice(member)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Debes estar en un canal de voz")] });
      return;
    }

    const nombre = interaction.options.getString("nombre", true);

    const playlist = await client.prisma.playlist.findFirst({
      where: {
        name: nombre,
        OR: [
          { userId: member.id },
          { guildId, isPublic: true },
          { guildId, type: "SERVER" },
        ],
      },
      include: { tracks: { orderBy: { position: "asc" } } },
    });

    if (!playlist) {
      await interaction.editReply({ embeds: [buildErrorEmbed(`No se encontro la playlist **${nombre}**`)] });
      return;
    }

    if (playlist.tracks.length === 0) {
      await interaction.editReply({ embeds: [buildErrorEmbed(`La playlist **${nombre}** esta vacia`)] });
      return;
    }

    const guildConfig = await client.prisma.guild.findUnique({
      where: { id: guildId },
    });

    let player = client.lavalink.getPlayer(guildId);
    if (!player) {
      player = client.lavalink.createPlayer({
        guildId,
        voiceChannelId: member.voice.channelId as string,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        volume: guildConfig?.volume ?? 100,
      });
    }

    await player.connect();

    for (const track of playlist.tracks) {
      if (!track.url) continue;
      const result = await player.search({ query: track.url }, member);
      if (result?.tracks?.[0]) {
        await player.queue.add(result.tracks[0]);
      }
    }

    if (!player.playing) await player.play();

    await updatePanel(client, guildId, player.queue.current);

    await interaction.editReply({
      embeds: [buildSuccessEmbed(`Reproduciendo playlist **${nombre}** (${playlist.tracks.length} canciones)`)],
    });
  },
};
