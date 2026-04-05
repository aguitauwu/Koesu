import { writeFileSync, mkdirSync } from "fs";

interface LavalinkConfig {
  password: string;
}

export async function generateLavalinkConfig(config: LavalinkConfig): Promise<void> {
  mkdirSync("plugins", { recursive: true });

  const yml = `server:
  port: 2333
  address: 0.0.0.0

lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.14.0"
      repository: "https://maven.lavalink.dev/releases"
      snapshot: false
    - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.3.0"
      repository: "https://maven.lavalink.dev/releases"
      snapshot: false
    - dependency: "com.github.topi314.lavasearch:lavasearch-plugin:1.0.0"
      repository: "https://maven.lavalink.dev/releases"
      snapshot: false
    - dependency: "com.github.topi314.sponsorblock:sponsorblock-plugin:3.0.0"
      repository: "https://maven.lavalink.dev/releases"
      snapshot: false
    - dependency: "com.github.topi314.lavalyrics:lavalyrics-plugin:1.0.0"
      repository: "https://maven.lavalink.dev/releases"
      snapshot: false
  server:
    password: "${config.password}"
    sources:
      youtube: false
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      http: true
      local: true
    filters:
      volume: true
      equalizer: true
      karaoke: true
      timescale: true
      tremolo: true
      vibrato: true
      distortion: true
      rotation: true
      channelMix: true
      lowPass: true
    bufferDurationMs: 400
    frameBufferDurationMs: 5000
    opusEncodingQuality: 10
    resamplingQuality: HIGH
    trackStuckThresholdMs: 10000
    youtubePlaylistLoadLimit: 6
    playerUpdateInterval: 5
    youtubeSearchEnabled: true
    soundcloudSearchEnabled: true
    gc-warnings: true

plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients:
      - M_WEB
      - WEB
      - MUSIC
      - WEBEMBEDDED
      - ANDROID_VR
      - TV
      - TVHTML5EMBEDDED
    oauth:
      enabled: false
      skipInitialization: false

  lavasrc:
    providers:
      - "ytsearch:\\"%ISRC%\\""
      - "ytsearch:%QUERY%"
      - "scsearch:%QUERY%"
    sources:
      spotify: true
      applemusic: false
      deezer: false
      yandexmusic: false
      flowerytts: false
      youtube: true
    spotify:
      clientId: ""
      clientSecret: ""
      countryCode: "US"
      playlistLoadLimit: 6
      albumLoadLimit: 6
    applemusic:
      countryCode: "US"
      mediaAPIToken: ""
      playlistLoadLimit: 6
      albumLoadLimit: 6
    deezer:
      masterDecryptionKey: ""
    yandexmusic:
      accessToken: ""

  lavalyrics:
    sources:
      - spotify
      - youtube

logging:
  file:
    path: ./logs/
  level:
    root: INFO
    lavalink: INFO
  request:
    enabled: true
    includeClientInfo: true
    includeHeaders: false
    includeQueryString: true
    includePayload: true
    maxPayloadLength: 10000
`;

  writeFileSync("application.yml", yml);
}
