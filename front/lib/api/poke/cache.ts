// Contract types for the poke cache endpoint (GET/DELETE /api/poke/cache).
// Shared between the Next handler and its Hono counterpart.

export interface RedisCacheResult {
  value: unknown | null;
  ttlSeconds: number;
}

export type RedisInstance = "cache" | "stream";

export type GetPokeCacheResponseBody = {
  key: string;
  cacheRedis: RedisCacheResult;
  streamRedis: RedisCacheResult;
};

export type DeletePokeCacheResponseBody = {
  key: string;
  redisInstance: RedisInstance;
  deleted: true;
};
