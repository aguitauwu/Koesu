import { execSync } from "child_process";
import { createLogger } from "../utils/logger.js";

const log = createLogger("redis");

export type RedisMode = "redis" | "memory";

interface RedisConfig {
  url: string;
  mode: RedisMode;
}

export async function setupRedis(config: RedisConfig): Promise<void> {
  process.env.REDIS_URL = config.url;
  process.env.REDIS_MODE = config.mode;

  if (config.mode === "memory") {
    log.warn("Redis en modo memoria. No usar en produccion");
    return;
  }

  try {
    execSync(`redis-cli -u ${config.url} ping`, { stdio: "ignore" });
    log.info("Conexion con Redis verificada");
  } catch {
    log.error("No se pudo conectar con Redis");
    throw new Error(`Redis no disponible en ${config.url}`);
  }
}

export function buildRedisUrl(
  host: string,
  port: number,
  password?: string
): string {
  if (password) {
    return `redis://:${password}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}
