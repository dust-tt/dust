// Contract types for the poke cache endpoint (GET/DELETE /api/poke/cache).
// Used by the poke cache API route.

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

export type DeleteAllPokeCacheResponseBody = {
  pattern: string;
  deletedCount: number;
};

export type PokeCacheResourceDescriptor = {
  id: string;
  label: string;
  params: Array<{
    key: string;
    label: string;
    type: "string" | "number";
    placeholder: string;
  }>;
  keyPattern: string | null;
};

export type GetPokeCacheCatalogResponseBody = {
  resources: PokeCacheResourceDescriptor[];
};
