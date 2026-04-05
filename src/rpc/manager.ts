import { UserGateway } from "./gateway.js";
import type { PresenceData } from "./gateway.js";
import { createLogger } from "../utils/logger.js";
import type { KoesuClient } from "../client.js";

const log = createLogger("rpc:manager");

export class RpcManager {
  private gateways = new Map<string, UserGateway>();
  private client: KoesuClient;

  constructor(client: KoesuClient) {
    this.client = client;
  }

  public async addUser(userId: string, token: string): Promise<void> {
    if (this.gateways.has(userId)) {
      this.gateways.get(userId)?.destroy();
    }

    const gateway = new UserGateway(token, userId);
    gateway.connect();
    this.gateways.set(userId, gateway);

    if (this.client.redis) {
      await this.client.redis.set(
        `rpc:token:${userId}`,
        token,
        "EX",
        60 * 60 * 24 * 30
      );
    }

    log.info(`RPC activado para usuario ${userId}`);
  }

  public async removeUser(userId: string): Promise<void> {
    const gateway = this.gateways.get(userId);
    if (!gateway) return;

    gateway.destroy();
    this.gateways.delete(userId);

    if (this.client.redis) {
      await this.client.redis.del(`rpc:token:${userId}`);
    }

    log.info(`RPC desactivado para usuario ${userId}`);
  }

  public updatePresence(guildId: string, presence: PresenceData): void {
    const player = this.client.lavalink.getPlayer(guildId);
    if (!player) return;

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    const voiceChannel = guild.channels.cache.get(player.voiceChannelId ?? "");
    if (!voiceChannel?.isVoiceBased()) return;

    for (const [memberId] of voiceChannel.members) {
      const gateway = this.gateways.get(memberId);
      if (gateway) gateway.updatePresence(presence);
    }
  }

  public clearPresence(guildId: string): void {
    const player = this.client.lavalink.getPlayer(guildId);
    if (!player) return;

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    const voiceChannel = guild.channels.cache.get(player.voiceChannelId ?? "");
    if (!voiceChannel?.isVoiceBased()) return;

    for (const [memberId] of voiceChannel.members) {
      const gateway = this.gateways.get(memberId);
      if (gateway) gateway.clearPresence();
    }
  }

  public async restoreFromRedis(): Promise<void> {
    if (!this.client.redis) return;

    const keys = await this.client.redis.keys("rpc:token:*");
    for (const key of keys) {
      const token = await this.client.redis.get(key);
      const userId = key.replace("rpc:token:", "");
      if (token) {
        const gateway = new UserGateway(token, userId);
        gateway.connect();
        this.gateways.set(userId, gateway);
        log.info(`RPC restaurado para usuario ${userId}`);
      }
    }
  }

  public hasUser(userId: string): boolean {
    return this.gateways.has(userId);
  }
}
