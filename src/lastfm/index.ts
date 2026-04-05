import { createLogger } from "../utils/logger.js";
import type { KoesuClient } from "../client.js";

const log = createLogger("lastfm");

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

interface ScrobbleData {
  artist: string;
  track: string;
  album?: string;
  timestamp: number;
}

export class LastFmManager {
  private client: KoesuClient;
  private sessions = new Map<string, string>();

  constructor(client: KoesuClient) {
    this.client = client;
  }

  public async scrobble(userId: string, data: ScrobbleData): Promise<void> {
    const sessionKey = await this.getSession(userId);
    if (!sessionKey) return;

    const apiKey = process.env.LASTFM_API_KEY;
    const apiSecret = process.env.LASTFM_API_SECRET;
    if (!apiKey || !apiSecret) return;

    const params: Record<string, string> = {
      method: "track.scrobble",
      artist: data.artist,
      track: data.track,
      timestamp: Math.floor(data.timestamp / 1000).toString(),
      api_key: apiKey,
      sk: sessionKey,
    };

    if (data.album) params.album = data.album;

    const sig = this.buildSignature(params, apiSecret);

    const body = new URLSearchParams({ ...params, api_sig: sig, format: "json" });

    const res = await fetch(LASTFM_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      log.error(`Error scrobbling para usuario ${userId}`);
      return;
    }

    log.info(`Scrobble exitoso: ${data.track} por ${data.artist} para ${userId}`);
  }

  public async updateNowPlaying(userId: string, data: ScrobbleData): Promise<void> {
    const sessionKey = await this.getSession(userId);
    if (!sessionKey) return;

    const apiKey = process.env.LASTFM_API_KEY;
    const apiSecret = process.env.LASTFM_API_SECRET;
    if (!apiKey || !apiSecret) return;

    const params: Record<string, string> = {
      method: "track.updateNowPlaying",
      artist: data.artist,
      track: data.track,
      api_key: apiKey,
      sk: sessionKey,
    };

    if (data.album) params.album = data.album;

    const sig = this.buildSignature(params, apiSecret);
    const body = new URLSearchParams({ ...params, api_sig: sig, format: "json" });

    await fetch(LASTFM_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }).catch((err) => log.error({ err }, "Error actualizando now playing"));
  }

  public async getAuthUrl(userId: string): Promise<string> {
    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) throw new Error("LASTFM_API_KEY no configurada");

    const token = await this.getToken(apiKey);

    if (this.client.redis) {
      await this.client.redis.set(`lastfm:token:${userId}`, token, "EX", 600);
    }

    return `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`;
  }

  public async connectSession(userId: string): Promise<boolean> {
    const apiKey = process.env.LASTFM_API_KEY;
    const apiSecret = process.env.LASTFM_API_SECRET;
    if (!apiKey || !apiSecret) return false;

    let token: string | null = null;

    if (this.client.redis) {
      token = await this.client.redis.get(`lastfm:token:${userId}`);
    }

    if (!token) return false;

    const params: Record<string, string> = {
      method: "auth.getSession",
      api_key: apiKey,
      token,
    };

    const sig = this.buildSignature(params, apiSecret);
    const url = `${LASTFM_API}?${new URLSearchParams({ ...params, api_sig: sig, format: "json" })}`;

    const res = await fetch(url);
    if (!res.ok) return false;

    const data = await res.json() as { session?: { key: string } };
    if (!data.session?.key) return false;

    const sessionKey = data.session.key;
    this.sessions.set(userId, sessionKey);

    if (this.client.redis) {
      await this.client.redis.set(
        `lastfm:session:${userId}`,
        sessionKey,
        "EX",
        60 * 60 * 24 * 365
      );
      await this.client.redis.del(`lastfm:token:${userId}`);
    }

    return true;
  }

  public async restoreFromRedis(): Promise<void> {
    if (!this.client.redis) return;

    const keys = await this.client.redis.keys("lastfm:session:*");
    for (const key of keys) {
      const session = await this.client.redis.get(key);
      const userId = key.replace("lastfm:session:", "");
      if (session) {
        this.sessions.set(userId, session);
        log.info(`Last.fm restaurado para usuario ${userId}`);
      }
    }
  }

  public hasSession(userId: string): boolean {
    return this.sessions.has(userId);
  }

  public removeSession(userId: string): void {
    this.sessions.delete(userId);
    if (this.client.redis) {
      this.client.redis.del(`lastfm:session:${userId}`).catch(() => null);
    }
  }

  private async getSession(userId: string): Promise<string | null> {
    if (this.sessions.has(userId)) return this.sessions.get(userId) as string;

    if (this.client.redis) {
      const session = await this.client.redis.get(`lastfm:session:${userId}`);
      if (session) {
        this.sessions.set(userId, session);
        return session;
      }
    }

    return null;
  }

  private async getToken(apiKey: string): Promise<string> {
    const res = await fetch(
      `${LASTFM_API}?method=auth.getToken&api_key=${apiKey}&format=json`
    );
    const data = await res.json() as { token: string };
    return data.token;
  }

  private buildSignature(params: Record<string, string>, secret: string): string {
    const { createHash } = require("crypto");
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");

    return createHash("md5").update(sorted + secret).digest("hex");
  }
}
