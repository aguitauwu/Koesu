import { createLogger } from "../utils/logger.js";
import { updatePanel } from "../panel/index.js";
import type { KoesuClient } from "../client.js";

const log = createLogger("lavalink");

export function registerLavalink(client: KoesuClient): void {
  const { lavalink } = client;

  lavalink.nodeManager.on("connect", (node) => {
    log.info(`Nodo conectado: ${node.id}`);
  });

  lavalink.nodeManager.on("disconnect", (node, reason) => {
    log.warn({ reason }, `Nodo desconectado: ${node.id}`);
  });

  lavalink.nodeManager.on("error", (node, error) => {
    log.error({ error }, `Error en nodo: ${node.id}`);
  });

  lavalink.nodeManager.on("reconnecting", (node) => {
    log.info(`Reconectando nodo: ${node.id}`);
  });

  lavalink.on("trackStart", async (player, track) => {
    if (!track) return;

    log.info(`Reproduciendo: ${track.info.title} en guild ${player.guildId}`);

    await updatePanel(client, player.guildId, track);

    const guildConfig = await client.prisma.guild.findUnique({
      where: { id: player.guildId },
    });

    await client.prisma.guild.upsert({
      where: { id: player.guildId },
      create: { id: player.guildId },
      update: {},
    });

    await client.prisma.guildStats.upsert({
      where: { guildId: player.guildId },
      create: { guildId: player.guildId, totalPlayed: 1 },
      update: { totalPlayed: { increment: 1 } },
    });

    const voiceChannelMembers = client.guilds.cache
      .get(player.guildId)
      ?.channels.cache.get(player.voiceChannelId ?? "");

    if (voiceChannelMembers?.isVoiceBased()) {
      for (const [memberId] of voiceChannelMembers.members) {
        if (memberId === client.user?.id) continue;
        await client.prisma.playHistory.create({
          data: {
            userId: memberId,
            guildId: player.guildId,
            title: track.info.title,
            author: track.info.author,
            url: track.info.uri ?? "",
            source: track.info.sourceName ?? "unknown",
            duration: track.info.duration ?? 0,
            thumbnail: track.info.artworkUrl ?? null,
          },
        }).catch(() => null);

        await client.prisma.userStats.upsert({
          where: { userId: memberId },
          create: { userId: memberId, totalPlayed: 1 },
          update: { totalPlayed: { increment: 1 } },
        }).catch(() => null);
      }
    }

    if (guildConfig?.logChannelId) {
      const channel = client.channels.cache.get(guildConfig.logChannelId);
      if (channel && 'send' in channel) {
        await channel.send({
          embeds: [
            {
              title: track.info.title,
              url: track.info.uri ?? undefined,
              description: `Por ${track.info.author}`,
              color: 0x5865f2,
              thumbnail: track.info.artworkUrl
                ? { url: track.info.artworkUrl }
                : undefined,
            },
          ],
        }).catch(() => null);
      }
    }

    if (guildConfig?.webhookUrl) {
      await fetch(guildConfig.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: track.info.title,
              url: track.info.uri ?? undefined,
              description: `Por ${track.info.author}`,
              color: 0x5865f2,
            },
          ],
        }),
      }).catch((err) => log.error({ err }, "Error enviando webhook"));
    }

    client.rpc.updatePresence(player.guildId, {
      name: "Koesu",
      details: track.info.title,
      state: track.info.author,
      largeImageUrl: track.info.artworkUrl ?? undefined,
      startTimestamp: Date.now(),
    });

    const voiceChannel = client.guilds.cache
      .get(player.guildId)
      ?.channels.cache.get(player.voiceChannelId ?? "");

    if (voiceChannel?.isVoiceBased() && guildConfig?.logChannelId) {
      const voiceConfig = await client.prisma.voiceChannelConfig.findFirst({
        where: { channelId: voiceChannel.id },
      });

      if (voiceConfig?.playlistId && !player.queue.tracks.length) {
        const playlist = await client.prisma.playlist.findUnique({
          where: { id: voiceConfig.playlistId },
          include: { tracks: { orderBy: { position: "asc" } } },
        });

        if (playlist?.tracks.length) {
          for (const t of playlist.tracks) {
            const result = await player.search({ query: t.url }, client.user);
            if (result?.tracks?.[0]) await player.queue.add(result.tracks[0]);
          }
        }
      }
    }
  });

  lavalink.on("trackEnd", async (player, track, payload) => {
    if (!track) return;
    log.info(`Track terminado: ${track.info.title} (${payload.reason})`);

    await client.prisma.guild.upsert({
      where: { id: player.guildId },
      create: { id: player.guildId },
      update: {},
    });

    await client.prisma.guildStats.upsert({
      where: { guildId: player.guildId },
      create: { guildId: player.guildId, totalTime: Math.min(track.info.duration ?? 0, 2147483647) },
      update: { totalTime: { increment: Math.min(track.info.duration ?? 0, 2147483647) } },
    });
  });

  lavalink.on("trackError", (player, track, payload) => {
    if (!track) return;
    log.error({ payload }, `Error en track: ${track.info.title}`);
  });

  lavalink.on("trackStuck", (player, track, payload) => {
    if (!track) return;
    log.warn({ payload }, `Track atascado: ${track.info.title}`);
  });

  lavalink.on("playerDestroy", (player, reason) => {
    log.info(`Player destruido en guild ${player.guildId} (${reason})`);
    client.rpc.clearPresence(player.guildId);
    updatePanel(client, player.guildId, null).catch(() => null);
  });

  lavalink.on("playerCreate", (player) => {
    log.info(`Player creado en guild ${player.guildId}`);
  });
}

export function registerLastFmScrobbling(client: KoesuClient): void {
  client.lavalink.on("trackStart", async (player, track) => {
    if (!track) return;

    const guild = client.guilds.cache.get(player.guildId);
    if (!guild) return;

    const voiceChannel = guild.channels.cache.get(player.voiceChannelId ?? "");
    if (!voiceChannel?.isVoiceBased()) return;

    for (const [memberId] of voiceChannel.members) {
      if (!client.lastfm.hasSession(memberId)) continue;

      await client.lastfm.updateNowPlaying(memberId, {
        artist: track.info.author,
        track: track.info.title,
        timestamp: Date.now(),
      }).catch(() => null);
    }
  });

  client.lavalink.on("trackEnd", async (player, track) => {
    if (!track) return;
    if (track.info.duration < 30_000) return;

    const guild = client.guilds.cache.get(player.guildId);
    if (!guild) return;

    const voiceChannel = guild.channels.cache.get(player.voiceChannelId ?? "");
    if (!voiceChannel?.isVoiceBased()) return;

    for (const [memberId] of voiceChannel.members) {
      if (!client.lastfm.hasSession(memberId)) continue;

      await client.lastfm.scrobble(memberId, {
        artist: track.info.author,
        track: track.info.title,
        timestamp: Date.now(),
      }).catch(() => null);
    }
  });
}
