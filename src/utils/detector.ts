import { execSync } from "child_process";
import { createLogger } from "./logger.js";

const log = createLogger("detector");

export type DatabaseType = "postgresql" | "mariadb" | "sqlite";
export type RedisStatus = "available" | "unavailable";

export function detectPostgres(): boolean {
  try {
    execSync("pg_isready", { stdio: "ignore" });
    log.info("PostgreSQL detectado");
    return true;
  } catch {
    return false;
  }
}

export function detectMariaDB(): boolean {
  try {
    execSync("mysqladmin ping --silent", { stdio: "ignore" });
    log.info("MariaDB detectado");
    return true;
  } catch {
    return false;
  }
}

export function detectRedis(): boolean {
  try {
    execSync("redis-cli ping", { stdio: "ignore" });
    log.info("Redis detectado");
    return true;
  } catch {
    return false;
  }
}

export function detectDocker(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    log.info("Docker detectado");
    return true;
  } catch {
    return false;
  }
}

export function detectDatabase(): DatabaseType | null {
  if (detectPostgres()) return "postgresql";
  if (detectMariaDB()) return "mariadb";
  return null;
}
