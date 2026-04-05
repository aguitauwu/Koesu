import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  TextChannel,
} from "discord.js";
import { buildTrackEmbed } from "../utils/embed.js";
import { createLogger } from "../utils/logger.js";
import type { KoesuClient } from "../client.js";
import type { Track } from "lavalink-client";

const log = createLogger("panel");

const DEFAULT_CONFIG = {
  color: "#5865F2",
  title: "Koesu Music",
  footer: "Koesu",
  thumbnail: true,
};

export async function updatePanel(
  client: KoesuClient,
  guildId: string,
  track: Track | null
): Promise<void> {
  const guild = await client.prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guild?.panelChannelId) return;

  const channel = client.channels.cache.get(guild.panelChannelId) as TextChannel;
  if (!channel) return;

  const config = {
    color: guild.panelColor,
    title: guild.panelTitle,
    footer: guild.panelFooter,
    thumbnail: guild.panelThumbnail,
  };

  const embed = track
    ? buildTrackEmbed(track, config)
    : buildTrackEmbed(
        {
          info: {
            title: "Nada reproduciendose",
            author: "-",
            duration: 0,
            artworkUrl: null,
            uri: "",
            sourceName: "youtube" as any,
            identifier: "",
            isSeekable: false,
            isStream: false,
            position: 0,
            isrc: null,
          },
          pluginInfo: {},
          userData: {},
          encoded: "",
        } as Track,
        config
      );

  const buttons = buildButtons(guild.panelButtons);

  try {
    if (guild.panelMessageId) {
      const message = await channel.messages
        .fetch(guild.panelMessageId)
        .catch(() => null);

      if (message) {
        await message.edit({ embeds: [embed], components: buttons });
        return;
      }
    }

    const message = await channel.send({ embeds: [embed], components: buttons });

    await client.prisma.guild.update({
      where: { id: guildId },
      data: { panelMessageId: message.id },
    });
  } catch (err) {
    log.error({ err }, `Error actualizando panel en guild ${guildId}`);
  }
}

function buildButtons(panelButtons: string): ActionRowBuilder<ButtonBuilder>[] {
  const enabled: string[] = JSON.parse(panelButtons || "[]");

  const allButtons: Record<string, ButtonBuilder> = {
    previous: new ButtonBuilder()
      .setCustomId("panel:previous")
      .setLabel("⏮")
      .setStyle(ButtonStyle.Secondary),
    pause: new ButtonBuilder()
      .setCustomId("panel:pause")
      .setLabel("⏸")
      .setStyle(ButtonStyle.Primary),
    skip: new ButtonBuilder()
      .setCustomId("panel:skip")
      .setLabel("⏭")
      .setStyle(ButtonStyle.Secondary),
    stop: new ButtonBuilder()
      .setCustomId("panel:stop")
      .setLabel("⏹")
      .setStyle(ButtonStyle.Danger),
    shuffle: new ButtonBuilder()
      .setCustomId("panel:shuffle")
      .setLabel("🔀")
      .setStyle(ButtonStyle.Secondary),
    loop: new ButtonBuilder()
      .setCustomId("panel:loop")
      .setLabel("🔁")
      .setStyle(ButtonStyle.Secondary),
    volumeDown: new ButtonBuilder()
      .setCustomId("panel:volumeDown")
      .setLabel("🔉")
      .setStyle(ButtonStyle.Secondary),
    volumeUp: new ButtonBuilder()
      .setCustomId("panel:volumeUp")
      .setLabel("🔊")
      .setStyle(ButtonStyle.Secondary),
    queue: new ButtonBuilder()
      .setCustomId("panel:queue")
      .setLabel("📋")
      .setStyle(ButtonStyle.Secondary),
    favorite: new ButtonBuilder()
      .setCustomId("panel:favorite")
      .setLabel("❤️")
      .setStyle(ButtonStyle.Secondary),
    download: new ButtonBuilder()
      .setCustomId("panel:download")
      .setLabel("📥")
      .setStyle(ButtonStyle.Secondary),
  };

  const defaultOrder = [
    "previous", "pause", "skip", "stop", "shuffle",
    "loop", "volumeDown", "volumeUp", "queue", "favorite", "download",
  ];

  const active = enabled.length > 0 ? enabled : defaultOrder;
  const selected = active
    .filter((id) => allButtons[id])
    .map((id) => allButtons[id]);

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < selected.length; i += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        selected.slice(i, i + 5)
      )
    );
  }

  return rows;
}

export async function handlePanelButton(
  client: KoesuClient,
  guildId: string,
  userId: string,
  action: string,
  message: Message
): Promise<string> {
  const player = client.lavalink.getPlayer(guildId);
  if (!player) return "No hay musica reproduciendose";

  switch (action) {
    case "previous": {
      const prev = player.queue.previous[0];
      if (!prev) return "No hay cancion anterior";
      await player.play({ clientTrack: prev });
      return `Reproduciendo anterior: ${prev.info.title}`;
    }
    case "pause": {
      if (player.paused) {
        await player.resume();
        return "Reanudado";
      } else {
        await player.pause();
        return "Pausado";
      }
    }
    case "skip": {
      await player.skip();
      return "Cancion saltada";
    }
    case "stop": {
      await player.stopPlaying();
      await player.destroy();
      return "Reproduccion detenida";
    }
    case "shuffle": {
      await player.queue.shuffle();
      return "Cola mezclada";
    }
    case "loop": {
      const modes = ["off", "track", "queue"] as const;
      const current = modes.indexOf(player.repeatMode);
      const next = modes[(current + 1) % modes.length];
      await player.setRepeatMode(next);
      return `Loop: ${next}`;
    }
    case "volumeDown": {
      const vol = Math.max(0, player.volume - 10);
      await player.setVolume(vol);
      return `Volumen: ${vol}%`;
    }
    case "volumeUp": {
      const vol = Math.min(100, player.volume + 10);
      await player.setVolume(vol);
      return `Volumen: ${vol}%`;
    }
    case "queue": {
      return "Usa /queue para ver la cola";
    }
    case "favorite": {
      const track = player.queue.current;
      if (!track) return "No hay cancion actual";
      const playlist = await client.prisma.playlist.findFirst({
        where: { userId, type: "PERSONAL", name: "Favoritos" },
      });
      if (!playlist) {
        const created = await client.prisma.playlist.create({
          data: { name: "Favoritos", type: "PERSONAL", userId },
        });
        await client.prisma.track.create({
          data: {
            title: track.info.title,
            author: track.info.author,
            url: track.info.uri ?? "",
            duration: track.info.duration,
            thumbnail: track.info.artworkUrl ?? null,
            source: track.info.sourceName,
            encoded: track.encoded,
            playlistId: created.id,
          },
        });
      } else {
        await client.prisma.track.create({
          data: {
            title: track.info.title,
            author: track.info.author,
            url: track.info.uri ?? "",
            duration: track.info.duration,
            thumbnail: track.info.artworkUrl ?? null,
            source: track.info.sourceName,
            encoded: track.encoded,
            playlistId: playlist.id,
          },
        });
      }
      return `Agregado a Favoritos: ${track.info.title}`;
    }
    case "download": {
      const track = player.queue.current;
      if (!track) return "No hay cancion actual";
      return `Descarga: ${track.info.uri}`;
    }
    default:
      return "Accion desconocida";
  }
}
