import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../utils/logger.js";
import type { KoesuClient } from "../client.js";

const log = createLogger("commands");
const __dirname = dirname(fileURLToPath(import.meta.url));

export async function registerCommands(client: KoesuClient): Promise<void> {
  const commandsPath = join(__dirname, "../commands");
  const categories = readdirSync(commandsPath);

  for (const category of categories) {
    const files = readdirSync(join(commandsPath, category)).filter(
      (f) => f.endsWith(".ts") || f.endsWith(".js")
    );

    for (const file of files) {
      const module = await import(join(commandsPath, category, file));
      const command = module.default;

      if (!command?.data || !command?.execute) {
        log.warn(`Comando invalido: ${file}`);
        continue;
      }

      client.commands.set(command.data.name, command);
      log.info(`Comando cargado: ${command.data.name}`);
    }
  }

  await deployCommands(client);
}

async function deployCommands(client: KoesuClient): Promise<void> {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
  const commands = client.commands.map((cmd) => cmd.data.toJSON());

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID!,
      process.env.GUILD_ID!
    ),
    { body: commands }
  );

  log.info(`${commands.length} comandos desplegados`);
}
