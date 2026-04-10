import "dotenv/config";
import { existsSync } from "fs";
import { spawn } from "child_process";
import { createLogger } from "./utils/logger.js";
import { KoesuClient } from "./client.js";
import { runWizard } from "./setup/wizard.js";
import { registerEvents } from "./handlers/events.js";
import { registerCommands } from "./handlers/commands.js";
import { registerLavalink, registerLastFmScrobbling } from "./handlers/lavalink.js";
import { startRpcServer } from "./rpc/server.js";

const log = createLogger("index");

let ytdlpProc: ReturnType<typeof spawn> | null = null;
let httpProc: ReturnType<typeof spawn> | null = null;

function startYtdlpServer(): void {
  if (ytdlpProc) {
    ytdlpProc.kill("SIGKILL");
    ytdlpProc = null;
  }
  try {
    const { execSync } = require("child_process") as typeof import("child_process");
    execSync(`fuser -k ${process.env.YTDLP_SERVER_PORT ?? 7331}/tcp 2>/dev/null`, { stdio: "ignore" });
  } catch { }

  const env = {
    ...process.env,
    YTDLP_SERVER_PORT: process.env.YTDLP_SERVER_PORT ?? "7331",
    MUSIC_DIR: process.env.MUSIC_DIR ?? "/root/musica",
    CACHE_DIR: process.env.CACHE_DIR ?? "./cache/audio",
    CACHE_MAX_MB: process.env.CACHE_MAX_MB ?? "500",
  };

  ytdlpProc = spawn("/root/koesu/sources/.venv/bin/python", ["-m", "koesu_sources.main"], {
    env,
    stdio: "inherit",
    cwd: "/root/koesu/sources",
  });

  ytdlpProc.on("exit", (code) => {
    log.warn(`Servidor ytdlp termino con codigo ${code}, reiniciando...`);
    setTimeout(startYtdlpServer, 3000);
  });

  log.info("Servidor ytdlp iniciado");
}

function startKoesuHttp(): void {
  if (httpProc) {
    httpProc.kill("SIGKILL");
    httpProc = null;
  }
  try {
    const { execSync } = require("child_process") as typeof import("child_process");
    execSync(`fuser -k ${process.env.KOESU_HTTP_PORT ?? 7332}/tcp 2>/dev/null`, { stdio: "ignore" });
  } catch { }

  const env = {
    ...process.env,
    KOESU_HTTP_PORT: process.env.KOESU_HTTP_PORT ?? "7332",
    KOESU_HTTP_HOST: process.env.KOESU_HTTP_HOST ?? "172.17.0.1",
    MUSIC_DIR: process.env.MUSIC_DIR ?? "/root/musica",
    CACHE_DIR: process.env.CACHE_DIR ?? "/root/koesu/cache/audio",
  };

  httpProc = spawn("/root/koesu/koesu-http/target/release/koesu-http", [], {
    env,
    stdio: "inherit",
  });

  httpProc.on("exit", (code) => {
    log.warn(`Servidor koesu-http termino con codigo ${code}, reiniciando...`);
    setTimeout(startKoesuHttp, 3000);
  });

  log.info("Servidor koesu-http iniciado");
}

async function main(): Promise<void> {
  if (!existsSync(".env") || !process.env.DISCORD_TOKEN) {
    log.info("No se encontro configuracion. Iniciando wizard...");
    await runWizard();
    return;
  }

  startYtdlpServer();
  startKoesuHttp();

  const client = new KoesuClient();

  await registerCommands(client);
  await registerEvents(client);

  await client.start();

  registerLavalink(client);
  registerLastFmScrobbling(client);
  await startRpcServer(client);
}

main().catch((err) => {
  log.error({ err }, "Error fatal");
  process.exit(1);
});
