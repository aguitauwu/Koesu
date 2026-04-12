import { Client, Collection, GatewayIntentBits } from "discord.js";
import { LavalinkManager } from "lavalink-client";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { Redis } from "ioredis";
import { RpcManager } from "./rpc/manager.js";
import { LastFmManager } from "./lastfm/index.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("client");

export interface Command {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: unknown) => Promise<void>;
}

export class KoesuClient extends Client {
  public commands: Collection<string, Command> = new Collection();
  public lavalink!: LavalinkManager;
  public prisma!: PrismaClient;
  public redis!: Redis | null;
  public rpc!: RpcManager;
  public lastfm!: LastFmManager;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });
  }

  public initDatabase(): void {
    const adapter = new PrismaLibSql({
      url: process.env.DATABASE_URL ?? "file:./koesu.db",
    });
    this.prisma = new PrismaClient({ adapter });
    log.info("Base de datos inicializada");
  }

  public initRedis(): void {
    const url = process.env.REDIS_URL;
    const mode = process.env.REDIS_MODE;

    if (mode === "memory" || !url) {
      this.redis = null;
      log.warn("Redis en modo memoria");
      return;
    }

    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on("error", (err) => log.error({ err }, "Redis error"));
    this.redis.on("connect", () => log.info("Redis conectado"));
  }

  public initLavalink(): void {
    this.lavalink = new LavalinkManager({
      nodes: [
        {
          host: process.env.LAVALINK_HOST ?? "localhost",
          port: Number(process.env.LAVALINK_PORT ?? 2333),
          authorization: process.env.LAVALINK_PASSWORD ?? "koesu",
          secure: process.env.LAVALINK_SECURE === "true",
          id: "koesu-node",
          retryAmount: 20,
          retryDelay: 5_000,
          heartBeatInterval: 30_000,
        },
      ],
      sendToShard: (guildId, payload) => {
        this.guilds.cache.get(guildId)?.shard?.send(payload);
      },
      autoSkip: true,
      autoSkipOnResolveError: true,
      emitNewSongsOnly: true,
      client: {
        id: process.env.CLIENT_ID as string,
        username: "Koesu",
      },
    });
  }

  public initRpc(): void {
    this.rpc = new RpcManager(this);
  }

  public initLastFm(): void {
    this.lastfm = new LastFmManager(this);
  }

  public async start(): Promise<void> {
    this.initDatabase();
    this.initRedis();
    this.initLavalink();
    this.on("raw", (d) => this.lavalink.sendRawData(d));
    this.initRpc();
    this.initLastFm();
    await this.login(process.env.DISCORD_TOKEN);
    log.info("Koesu iniciado");
  }
}
