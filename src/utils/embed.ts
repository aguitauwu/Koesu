import { EmbedBuilder, ColorResolvable } from "discord.js";
import type { Track } from "lavalink-client";

interface PanelConfig {
  color: string;
  title: string;
  footer: string;
  thumbnail: boolean;
}

export function buildTrackEmbed(track: Track, config: PanelConfig): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(config.color as ColorResolvable)
    .setTitle(config.title)
    .addFields(
      { name: "Titulo", value: track.info.title, inline: true },
      { name: "Artista", value: track.info.author, inline: true },
      { name: "Duracion", value: formatDuration(track.info.duration), inline: true },
      { name: "Fuente", value: track.info.sourceName, inline: true },
    )
    .setFooter({ text: config.footer });

  if (config.thumbnail && track.info.artworkUrl) {
    embed.setThumbnail(track.info.artworkUrl);
  }

  return embed;
}

export function buildQueueEmbed(
  tracks: Track[],
  current: Track | null,
  config: PanelConfig,
  page: number = 1
): EmbedBuilder {
  const perPage = 10;
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const slice = tracks.slice(start, end);
  const totalPages = Math.ceil(tracks.length / perPage);

  const embed = new EmbedBuilder()
    .setColor(config.color as ColorResolvable)
    .setTitle(`${config.title} — Cola`)
    .setFooter({ text: `${config.footer} • Pagina ${page}/${totalPages}` });

  if (current) {
    embed.addFields({
      name: "Reproduciendo",
      value: `[${current.info.title}](${current.info.uri})`,
    });
  }

  if (slice.length === 0) {
    embed.setDescription("La cola esta vacia");
  } else {
    embed.setDescription(
      slice
        .map(
          (t, i) =>
            `${start + i + 1}. [${t.info.title}](${t.info.uri}) — ${formatDuration(t.info.duration)}`
        )
        .join("\n")
    );
  }

  return embed;
}

export function buildErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor("#ED4245")
    .setDescription(message);
}

export function buildSuccessEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor("#57F287")
    .setDescription(message);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}`;
  }
  return `${minutes}:${pad(seconds % 60)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
