import { Events } from "discord.js";
import { createLogger } from "../utils/logger.js";
import type { KoesuClient } from "../client.js";

const log = createLogger("ready");

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: KoesuClient): Promise<void> {
    log.info(`Conectado como ${client.user?.tag}`);

    await client.lavalink.init({
      id: client.user?.id as string,
      username: client.user?.username as string,
    });

    await client.rpc.restoreFromRedis();
    await client.lastfm.restoreFromRedis();

    log.info("Koesu listo");
  },
};
