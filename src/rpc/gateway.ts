import WebSocket from "ws";
import { createLogger } from "../utils/logger.js";

const log = createLogger("rpc:gateway");

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

export interface PresenceData {
  name: string;
  details: string;
  state: string;
  largeImageUrl?: string;
  smallImageUrl?: string;
  startTimestamp?: number;
}

export class UserGateway {
  private ws: WebSocket | null = null;
  private token: string;
  private userId: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private sequence: number | null = null;
  private presence: PresenceData | null = null;
  private reconnecting = false;

  constructor(token: string, userId: string) {
    this.token = token;
    this.userId = userId;
  }

  public connect(): void {
    this.ws = new WebSocket(GATEWAY_URL);

    this.ws.on("open", () => {
      log.info(`Gateway abierto para usuario ${this.userId}`);
    });

    this.ws.on("message", (data) => {
      this.handleMessage(JSON.parse(data.toString()));
    });

    this.ws.on("close", (code) => {
      log.warn(`Gateway cerrado para ${this.userId} con codigo ${code}`);
      this.cleanup();
      if (!this.reconnecting) {
        setTimeout(() => this.connect(), 5000);
      }
    });

    this.ws.on("error", (err) => {
      log.error({ err }, `Gateway error para ${this.userId}`);
    });
  }

  private handleMessage(payload: any): void {
    const { op, d, s, t } = payload;

    if (s) this.sequence = s;

    switch (op) {
      case 10:
        this.startHeartbeat(d.heartbeat_interval);
        this.identify();
        break;
      case 11:
        break;
      case 0:
        if (t === "READY") {
          this.sessionId = d.session_id;
          log.info(`Gateway listo para ${this.userId}`);
          if (this.presence) this.updatePresence(this.presence);
        }
        break;
      case 7:
        this.reconnect();
        break;
      case 9:
        if (d) {
          this.resume();
        } else {
          this.identify();
        }
        break;
    }
  }

  private identify(): void {
    this.send({
      op: 2,
      d: {
        token: this.token,
        properties: {
          os: "linux",
          browser: "Koesu",
          device: "Koesu",
        },
        presence: this.presence ? this.buildPresencePayload(this.presence) : undefined,
      },
    });
  }

  private resume(): void {
    if (!this.sessionId) {
      this.identify();
      return;
    }
    this.send({
      op: 6,
      d: {
        token: this.token,
        session_id: this.sessionId,
        seq: this.sequence,
      },
    });
  }

  private reconnect(): void {
    this.reconnecting = true;
    this.cleanup();
    this.reconnecting = false;
    this.connect();
  }

  private startHeartbeat(interval: number): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({ op: 1, d: this.sequence });
    }, interval);
  }

  public updatePresence(presence: PresenceData): void {
    this.presence = presence;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.send({ op: 3, d: this.buildPresencePayload(presence) });
  }

  public clearPresence(): void {
    this.presence = null;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.send({
      op: 3,
      d: {
        since: null,
        activities: [],
        status: "online",
        afk: false,
      },
    });
  }

  private buildPresencePayload(presence: PresenceData): object {
    return {
      since: presence.startTimestamp ?? Date.now(),
      status: "online",
      afk: false,
      activities: [
        {
          name: presence.name,
          type: 2,
          details: presence.details,
          state: presence.state,
          timestamps: { start: presence.startTimestamp ?? Date.now() },
          assets: {
            large_image: presence.largeImageUrl ?? undefined,
            large_text: presence.details,
            small_image: presence.smallImageUrl ?? undefined,
            small_text: presence.state,
          },
        },
      ],
    };
  }

  private send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.ws?.removeAllListeners();
    this.ws = null;
  }

  public destroy(): void {
    this.reconnecting = true;
    this.cleanup();
  }
}
