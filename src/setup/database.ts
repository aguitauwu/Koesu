import { execSync } from "child_process";
import { createLogger } from "../utils/logger.js";

const log = createLogger("database");

export type DatabaseType = "postgresql" | "mariadb" | "sqlite";

interface DatabaseConfig {
  type: DatabaseType;
  url: string;
}

export async function setupDatabase(config: DatabaseConfig): Promise<void> {
  process.env.DATABASE_URL = config.url;
  process.env.DATABASE_TYPE = config.type;

  try {
    execSync("pnpm prisma generate", { stdio: "inherit" });
    execSync("pnpm prisma migrate deploy", { stdio: "inherit" });
    log.info(`Base de datos ${config.type} configurada`);
  } catch (error) {
    log.error({ error }, "Error configurando base de datos");
    throw error;
  }
}

export function buildDatabaseUrl(
  type: DatabaseType,
  user: string,
  password: string,
  host: string,
  port: number,
  name: string
): string {
  switch (type) {
    case "postgresql":
      return `postgresql://${user}:${password}@${host}:${port}/${name}`;
    case "mariadb":
      return `mysql://${user}:${password}@${host}:${port}/${name}`;
    case "sqlite":
      return "file:./koesu.db";
  }
}
