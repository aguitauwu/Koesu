import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import { isInVoice, isSameVoice, checkQueueLimit } from "../../utils/permissions.js";
import { updatePanel } from "../../panel/index.js";
import { resolve, isAvailable } from "../../ytdlp/client.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Reproduce una cancion o playlist")
    .addStringOption((opt) =>
      opt.setName("query").setDescription("URL o nombre de la cancion").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("source")
        .setDescription("Fuente de musica")
        .setRequired(false)
        .addChoices(
          { name: "Auto", value: "auto" },
          { name: "YouTube (yt-dlp)", value: "youtube" },
          { name: "Local", value: "local" },
          { name: "SoundCloud", value: "soundcloud" },
          { name: "Spotify", value: "spotify" },
          { name: "Apple Music", value: "applemusic" },
          { name: "Deezer", value: "deezer" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId as string;
    const query = interaction.options.getString("query", true);
    const source = interaction.options.getString("source") ?? "auto";

    await interaction.deferReply({ ephemeral: true });

    if (!await isInVoice(member)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Debes estar en un canal de voz")] });
      return;
    }

    if (!await isSameVoice(member, client)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Debes estar en el mismo canal de voz que el bot")] });
      return;
    }

    if (!await checkQueueLimit(member, client)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Has alcanzado el limite de canciones en la cola")] });
      return;
    }

    const guildConfig = await client.prisma.guild.findUnique({
      where: { id: guildId },
    });

    const blockedGenres: string[] = JSON.parse(guildConfig?.blockedGenres ?? "[]");
    const guildMusicDir = process.env.MUSIC_DIR ?? "/root/musica";

    let player = client.lavalink.getPlayer(guildId);
    if (!player) {
      player = client.lavalink.createPlayer({
        guildId,
        voiceChannelId: member.voice.channelId as string,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        volume: guildConfig?.volume ?? 100,
        node: await getBestNode(client),
      });
    }

    await player.connect();

    const ytdlpAvailable = await isAvailable();
    let resolved = null;

    if (ytdlpAvailable && (source === "auto" || source === "youtube" || source === "local")) {
      resolved = await resolve(query, source, guildMusicDir);
    }

    if (resolved && !resolved.passthrough) {
      const srcName = resolved.source ?? "youtube";
      if (blockedGenres.includes(srcName)) {
        await interaction.editReply({
          embeds: [buildErrorEmbed(`La fuente **${srcName}** esta bloqueada en este servidor`)],
        });
        return;
      }

      const result = await player.search({ query: resolved.streamUrl.replace("localhost", process.env.LAVALINK_YTDLP_HOST ?? "172.17.0.1"), source: "http" }, member);

      if (!result || result.loadType === "error" || result.loadType === "empty") {
        await interaction.editReply({ embeds: [buildErrorEmbed("Error cargando el audio")] });
        return;
      }

      const track = result.tracks[0];
      if (!track) {
        await interaction.editReply({ embeds: [buildErrorEmbed("No se encontro audio para esta fuente")] });
        return;
      }
      track.info.title = resolved.title;
      track.info.author = resolved.author;

      await player.queue.add(track);
      await interaction.editReply({
        embeds: [buildSuccessEmbed(`Agregado: **${resolved.title}** por **${resolved.author}** (${resolved.cached ? "cache" : "stream"})`)],
      });

    } else {
      const lavaSource = resolved?.passthrough ? resolved.source : detectSource(query, source);
      const result = await player.search({ query, source: lavaSource as any }, member);

      if (!result || result.loadType === "error" || result.loadType === "empty") {
        await interaction.editReply({ embeds: [buildErrorEmbed("No se encontraron resultados")] });
        return;
      }

      if (result.loadType === "playlist") {
        await player.queue.add(result.tracks);
        await interaction.editReply({
          embeds: [buildSuccessEmbed(`Playlist agregada: **${result.playlist?.title}** (${result.tracks.length} canciones)`)],
        });
      } else {
        const track = result.tracks[0];
        const trackSource = (track.info.sourceName ?? "").toLowerCase();
        if (blockedGenres.includes(trackSource)) {
          await interaction.editReply({
            embeds: [buildErrorEmbed(`La fuente **${trackSource}** esta bloqueada`)],
          });
          return;
        }
        await player.queue.add(track);
        await interaction.editReply({
          embeds: [buildSuccessEmbed(`Agregado: **${track.info.title}** por **${track.info.author ?? "Unknown"}**`)],
        });
      }
    }

    if (!player.playing) await player.play();

    await updatePanel(client, guildId, player.queue.current);

    await client.prisma.guildStats.upsert({
      where: { guildId },
      create: { guildId, totalPlayed: 1 },
      update: { totalPlayed: { increment: 1 } },
    });

    await client.prisma.userStats.upsert({
      where: { userId: member.id },
      create: { userId: member.id, totalPlayed: 1 },
      update: { totalPlayed: { increment: 1 } },
    });
  },
};

function detectSource(query: string, source: string): string {
  if (source !== "auto") return source;
  if (query.includes("spotify.com")) return "spotify";
  if (query.includes("soundcloud.com")) return "soundcloud";
  if (query.includes("youtube.com") || query.includes("youtu.be")) return "youtube";
  if (query.includes("music.apple.com")) return "applemusic";
  if (query.includes("deezer.com")) return "deezer";
  return "ytsearch";
}

function getBestNode(client: KoesuClient): string {
  const nodes = client.lavalink.nodeManager.nodes;
  let bestNode: { id: string; connected: boolean; stats?: { cpu?: { lavalinkLoad?: number }; playingPlayers?: number } } | undefined;
  let bestPenalty = Infinity;

  for (const node of nodes.values()) {
    if (!node.connected) continue;
    const penalty =
      (node.stats?.cpu?.lavalinkLoad ?? 0) * 100 +
      (node.stats?.playingPlayers ?? 0);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestNode = node;
    }
  }

  return bestNode?.id ?? "koesu-node";
}
