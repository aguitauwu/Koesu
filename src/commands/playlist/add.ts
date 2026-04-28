import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("playlist-add")
    .setDescription("Agrega una cancion a una playlist")
    .addStringOption((opt) =>
      opt.setName("playlist").setDescription("Nombre de la playlist").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("query").setDescription("URL o nombre de la cancion").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    const nombre = interaction.options.getString("playlist", true);
    const query = interaction.options.getString("query", true);

    const playlist = await client.prisma.playlist.findFirst({
      where: {
        name: nombre,
        OR: [
          { userId: member.id },
          { guildId, isPublic: true },
          { guildId, type: "SERVER" },
        ],
      },
    });

    if (!playlist) {
      await interaction.editReply({ embeds: [buildErrorEmbed(`No se encontro la playlist **${nombre}**`)] });
      return;
    }

    let player = client.lavalink.getPlayer(guildId);
    const createdForSearch = !player;
    if (!player) {
      const voiceChannelId = member.voice.channelId;
      if (!voiceChannelId) {
        await interaction.editReply({ embeds: [buildErrorEmbed("Debes estar en un canal de voz")] });
        return;
      }
      player = client.lavalink.createPlayer({
        guildId,
        voiceChannelId,
        textChannelId: interaction.channelId,
        selfDeaf: true,
      });
    }

    const result = await player.search({ query }, member);

    if (createdForSearch) {
      player.destroy().catch(() => null);
    }

    if (!result || result.loadType === "error" || result.loadType === "empty") {
      await interaction.editReply({ embeds: [buildErrorEmbed("No se encontraron resultados")] });
      return;
    }

    const track = result.tracks[0];
    const position = await client.prisma.track.count({
      where: { playlistId: playlist.id },
    });

    await client.prisma.track.create({
      data: {
        title: track.info.title,
        author: track.info.author ?? '',
        url: track.info.uri ?? "",
        duration: track.info.duration ?? 0,
        thumbnail: track.info.artworkUrl ?? null,
        source: track.info.sourceName ?? '',
        encoded: track.encoded,
        playlistId: playlist.id,
        position,
      },
    });

    await interaction.editReply({
      embeds: [buildSuccessEmbed(`**${track.info.title}** agregado a **${nombre}**`)],
    });
  },
};
