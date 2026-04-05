import type { KoesuClient } from "../client.js";
import type { Guild } from "@prisma/client";

const CACHE_TTL = 300;
const memoryCache = new Map<string, { data: Guild; expires: number }>();

export async function getGuildConfig(
  client: KoesuClient,
  guildId: string
): Promise<Guild | null> {
  const cacheKey = `guild:${guildId}`;

  if (client.redis) {
    const cached = await client.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Guild;
  } else {
    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.data;
  }

  const guild = await client.prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guild) return null;

  if (client.redis) {
    await client.redis.set(cacheKey, JSON.stringify(guild), "EX", CACHE_TTL);
  } else {
    memoryCache.set(cacheKey, { data: guild, expires: Date.now() + CACHE_TTL * 1000 });
  }

  return guild;
}

export async function invalidateGuildConfig(
  client: KoesuClient,
  guildId: string
): Promise<void> {
  const cacheKey = `guild:${guildId}`;

  if (client.redis) {
    await client.redis.del(cacheKey);
  } else {
    memoryCache.delete(cacheKey);
  }
}

export async function setUserData(
  client: KoesuClient,
  userId: string,
  data: Record<string, unknown>,
  ttl: number = CACHE_TTL
): Promise<void> {
  const cacheKey = `user:${userId}`;

  if (client.redis) {
    await client.redis.set(cacheKey, JSON.stringify(data), "EX", ttl);
  } else {
    memoryCache.set(cacheKey, { data: data as any, expires: Date.now() + ttl * 1000 });
  }
}

export async function getUserData(
  client: KoesuClient,
  userId: string
): Promise<Record<string, unknown> | null> {
  const cacheKey = `user:${userId}`;

  if (client.redis) {
    const cached = await client.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } else {
    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.data as any;
  }

  return null;
}

export function clearMemoryCache(): void {
  const now = Date.now();
  for (const [key, value] of memoryCache) {
    if (value.expires < now) memoryCache.delete(key);
  }
}

setInterval(clearMemoryCache, 60_000);
