import { confirm, select, input, password } from "@inquirer/prompts";
import { detectDatabase, detectRedis, detectDocker } from "../utils/detector.js";
import { createLogger } from "../utils/logger.js";
import { generateDockerCompose } from "./docker.js";
import { generateLavalinkConfig } from "./lavalink.js";
import { setupDatabase } from "./database.js";
import { setupRedis } from "./redis.js";
import { writeFileSync } from "fs";

const log = createLogger("wizard");

export async function runWizard(): Promise<void> {
  console.clear();
  console.log("=================================");
  console.log("        Koesu - Setup Wizard     ");
  console.log("=================================\n");

  const token = await password({ message: "Discord Bot Token:" });
  const clientId = await input({ message: "Client ID:" });
  const guildId = await input({ message: "Guild ID:" });

  const hasDocker = detectDocker();
  let useDocker = false;

  if (hasDocker) {
    useDocker = await confirm({
      message: "Docker detectado. Usar Docker para Lavalink, DB y Redis?",
      default: true,
    });
  }

  let dbType: "postgresql" | "mariadb" | "sqlite" = "sqlite";
  let dbUrl = "file:./koesu.db";
  let redisUrl = "redis://localhost:6379";
  let lavalinkHost = "localhost";
  let lavalinkPort = 2333;
  let lavalinkPassword = "koesu";

  if (useDocker) {
    dbType = await select({
      message: "Base de datos:",
      choices: [
        { name: "PostgreSQL", value: "postgresql" as const },
        { name: "MariaDB", value: "mariadb" as const },
      ],
    });

    const dbUser = await input({ message: "Usuario DB:", default: "koesu" });
    const dbPass = await password({ message: "Password DB:" });
    const dbName = await input({ message: "Nombre DB:", default: "koesu" });

    dbUrl = dbType === "postgresql"
      ? `postgresql://${dbUser}:${dbPass}@localhost:5432/${dbName}`
      : `mysql://${dbUser}:${dbPass}@localhost:3306/${dbName}`;

    lavalinkPassword = await input({ message: "Password Lavalink:", default: "koesu" });

    await generateDockerCompose({ dbType, dbUser, dbPass, dbName, lavalinkPassword });
    await generateLavalinkConfig({ password: lavalinkPassword });

  } else {
    const detected = detectDatabase();

    if (detected) {
      const useDetected = await confirm({
        message: `${detected} detectado. Usarlo?`,
        default: true,
      });

      if (useDetected) {
        dbType = detected;
        dbUrl = await input({ message: "Database URL:" });
      } else {
        dbType = "sqlite";
        dbUrl = "file:./koesu.db";
      }
    } else {
      const choice = await select({
        message: "No se detecto ninguna DB. Que hacer?",
        choices: [
          { name: "Usar SQLite", value: "sqlite" as const },
          { name: "Configurar manualmente", value: "manual" as const },
        ],
      });

      if (choice === "manual") {
        dbType = await select({
          message: "Tipo de DB:",
          choices: [
            { name: "PostgreSQL", value: "postgresql" as const },
            { name: "MariaDB", value: "mariadb" as const },
          ],
        });
        dbUrl = await input({ message: "Database URL:" });
      }
    }

    const hasRedis = detectRedis();

    if (hasRedis) {
      redisUrl = await input({ message: "Redis URL:", default: "redis://localhost:6379" });
    } else {
      const redisChoice = await select({
        message: "Redis no detectado. Que hacer?",
        choices: [
          { name: "Usar memoria (solo dev)", value: "memory" as const },
          { name: "Configurar manualmente", value: "manual" as const },
        ],
      });

      if (redisChoice === "manual") {
        redisUrl = await input({ message: "Redis URL:" });
      } else {
        redisUrl = "memory";
      }
    }

    lavalinkHost = await input({ message: "Lavalink host:", default: "localhost" });
    lavalinkPort = Number(await input({ message: "Lavalink port:", default: "2333" }));
    lavalinkPassword = await input({ message: "Lavalink password:", default: "koesu" });
  }

  const logLevel = await select({
    message: "Nivel de logs:",
    choices: [
      { name: "info", value: "info" },
      { name: "debug", value: "debug" },
      { name: "warn", value: "warn" },
    ],
  });

  const env = [
    `DISCORD_TOKEN=${token}`,
    `CLIENT_ID=${clientId}`,
    `GUILD_ID=${guildId}`,
    `DATABASE_URL=${dbUrl}`,
    `DATABASE_TYPE=${dbType}`,
    `REDIS_URL=${redisUrl}`,
    `LAVALINK_HOST=${lavalinkHost}`,
    `LAVALINK_PORT=${lavalinkPort}`,
    `LAVALINK_PASSWORD=${lavalinkPassword}`,
    `LAVALINK_SECURE=false`,
    `LOG_LEVEL=${logLevel}`,
  ].join("\n");

  writeFileSync(".env", env);
  log.info("Archivo .env generado");

  if (useDocker) {
    log.info("Ejecuta: docker compose up -d");
  }

  await setupDatabase({ type: dbType, url: dbUrl });
  await setupRedis({ url: redisUrl, mode: redisUrl === "memory" ? "memory" : "redis" });
  log.info("Setup completado. Ejecuta: pnpm dev");
}
