import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../utils/logger.js";
import type { KoesuClient } from "../client.js";

const log = createLogger("events");
const __dirname = dirname(fileURLToPath(import.meta.url));

export async function registerEvents(client: KoesuClient): Promise<void> {
  const eventsPath = join(__dirname, "../events");
  const files = readdirSync(eventsPath).filter(
    (f) => f.endsWith(".ts") || f.endsWith(".js")
  );

  for (const file of files) {
    const module = await import(join(eventsPath, file));
    const event = module.default;

    if (!event?.name || !event?.execute) {
      log.warn(`Evento invalido: ${file}`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(client, ...args));
    } else {
      client.on(event.name, (...args) => event.execute(client, ...args));
    }

    log.info(`Evento cargado: ${event.name}`);
  }
}
