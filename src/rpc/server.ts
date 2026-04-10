import Fastify from "fastify";
import { createLogger } from "../utils/logger.js";
import type { KoesuClient } from "../client.js";

const log = createLogger("rpc:server");

const DISCORD_API = "https://discord.com/api/v10";

export async function startRpcServer(client: KoesuClient): Promise<void> {
  const fastify = Fastify({ logger: false });

  fastify.get("/rpc/auth", async (request, reply) => {
    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID as string,
      redirect_uri: `${process.env.RPC_REDIRECT_URI}/rpc/callback`,
      response_type: "code",
      scope: "identify",
    });
    return reply.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  fastify.get<{ Querystring: { code?: string; error?: string } }>(
    "/rpc/callback",
    async (request, reply) => {
      const { code, error } = request.query;

      if (error || !code) {
        return reply.code(400).send({ error: "Autorizacion denegada" });
      }

      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.CLIENT_ID as string,
          client_secret: process.env.CLIENT_SECRET as string,
          grant_type: "authorization_code",
          code,
          redirect_uri: `${process.env.RPC_REDIRECT_URI}/rpc/callback`,
        }),
      });

      if (!tokenRes.ok) {
        return reply.code(500).send({ error: "Error obteniendo token" });
      }

      const tokenData = await tokenRes.json() as { access_token: string };

      const userRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return reply.code(500).send({ error: "Error obteniendo usuario" });
      }

      const user = await userRes.json() as { id: string; username: string };

      await client.rpc.addUser(user.id, tokenData.access_token);

      return reply.send({
        message: `RPC activado para ${user.username}. Puedes cerrar esta ventana.`,
      });
    }
  );

  fastify.get<{ Params: { userId: string } }>(
    "/rpc/disable/:userId",
    async (request, reply) => {
      const { userId } = request.params;
      await client.rpc.removeUser(userId);
      return reply.send({ message: "RPC desactivado" });
    }
  );

  fastify.get("/status", async (_request, reply) => {
    const players = [];
    for (const [guildId, player] of client.lavalink.players) {
      const track = player.queue.current;
      players.push({
        guildId,
        track: track ? {
          title: track.info.title,
          author: track.info.author,
          duration: track.info.duration > 9000000000000 ? 0 : track.info.duration,
          position: player.position,
        } : null,
        queueSize: player.queue.tracks.length,
        playing: player.playing,
        paused: player.paused,
      });
    }
    return reply.send({ players });
  });

  const port = Number(process.env.RPC_PORT ?? 3000);
  await fastify.listen({ port, host: "0.0.0.0" });
  log.info(`RPC server escuchando en puerto ${port}`);
}
