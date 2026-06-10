import type {
  DeleteAllPokeCacheResponseBody,
  DeletePokeCacheResponseBody,
  GetPokeCacheResponseBody,
  RedisCacheResult,
} from "@app/lib/api/poke/cache";
import { runOnRedis, runOnRedisCache } from "@app/lib/api/redis";
import logger from "@app/logger/logger";
import {
  buildCacheKey,
  buildCacheKeyPattern,
  getCacheResourceById,
} from "@app/types/shared/cache_resource_registry";
import { isString } from "@app/types/shared/utils/general";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";

// Mounted at /api/poke/cache. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

function resolveCacheKey(
  ctx: Context
): { cacheKey: string } | { err: ReturnType<typeof apiError> } {
  const resourceId = ctx.req.query("resourceId");
  const rawKey = ctx.req.query("rawKey");
  const params = ctx.req.query("params");

  if (isString(resourceId)) {
    const resource = getCacheResourceById(resourceId);
    if (!resource) {
      return {
        err: apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Unknown resource ID: '${resourceId}'.`,
          },
        }),
      };
    }

    let parsedParams: Record<string, string>;
    try {
      parsedParams = JSON.parse(isString(params) ? params : "{}") as Record<
        string,
        string
      >;
    } catch {
      return {
        err: apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The 'params' query parameter must be valid JSON.",
          },
        }),
      };
    }

    const missingKeys = resource.params
      .filter((p) => !parsedParams[p.key])
      .map((p) => p.key);

    if (missingKeys.length > 0) {
      return {
        err: apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Missing required params: ${missingKeys.join(", ")}.`,
          },
        }),
      };
    }

    return { cacheKey: buildCacheKey(resource, parsedParams) };
  }

  if (isString(rawKey)) {
    return { cacheKey: rawKey };
  }

  return {
    err: apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Either 'rawKey' or 'resourceId' query parameter must be provided.",
      },
    }),
  };
}

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetPokeCacheResponseBody> => {
  const r = resolveCacheKey(ctx);
  if ("err" in r) {
    return r.err;
  }
  const { cacheKey } = r;

  const lookupKey = async (
    runFn: typeof runOnRedisCache
  ): Promise<RedisCacheResult> => {
    return runFn({ origin: "poke_cache_lookup" }, async (client) => {
      const [rawValue, ttl] = await Promise.all([
        client.get(cacheKey),
        client.ttl(cacheKey),
      ]);

      let parsed: unknown | null = null;
      if (rawValue !== null) {
        try {
          parsed = JSON.parse(rawValue);
        } catch {
          parsed = rawValue;
        }
      }

      return { value: parsed, ttlSeconds: ttl };
    });
  };

  const [cacheRedis, streamRedis] = await Promise.all([
    lookupKey(runOnRedisCache).catch(() => ({
      value: null,
      ttlSeconds: -1,
    })),
    lookupKey(runOnRedis).catch(() => ({
      value: null,
      ttlSeconds: -1,
    })),
  ]);

  logger.info(
    {
      redisKey: cacheKey,
      foundInCache: cacheRedis.value !== null,
      foundInStream: streamRedis.value !== null,
    },
    "Poke cache lookup performed"
  );

  return ctx.json({
    key: cacheKey,
    cacheRedis,
    streamRedis,
  });
});

app.delete("/", async (ctx): HandlerResult<DeletePokeCacheResponseBody> => {
  const r = resolveCacheKey(ctx);
  if ("err" in r) {
    return r.err;
  }
  const { cacheKey } = r;

  const redisInstance = ctx.req.query("redisInstance");
  if (redisInstance !== "cache" && redisInstance !== "stream") {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The 'redisInstance' query parameter must be 'cache' or 'stream'.",
      },
    });
  }

  const runFn = redisInstance === "cache" ? runOnRedisCache : runOnRedis;

  await runFn({ origin: "poke_cache_invalidation" }, async (client) => {
    await client.del(cacheKey);
  });

  logger.info(
    { redisKey: cacheKey, redisInstance },
    "Poke cache invalidation performed"
  );

  return ctx.json({
    key: cacheKey,
    redisInstance,
    deleted: true,
  });
});

const DELETE_ALL_BATCH_SIZE = 500;

// Deletes all cache entries of a resource type by scanning for its key pattern. Only targets the
// cache Redis instance since `cacheWithRedis` exclusively writes there.
app.delete("/all", async (ctx): HandlerResult<DeleteAllPokeCacheResponseBody> => {
  const resourceId = ctx.req.query("resourceId");
  if (!isString(resourceId)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The 'resourceId' query parameter must be provided.",
      },
    });
  }

  const resource = getCacheResourceById(resourceId);
  if (!resource) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Unknown resource ID: '${resourceId}'.`,
      },
    });
  }

  const pattern = buildCacheKeyPattern(resource);
  if (!pattern) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Resource '${resourceId}' does not support bulk deletion.`,
      },
    });
  }

  const deletedCount = await runOnRedisCache(
    { origin: "poke_cache_invalidation" },
    async (client) => {
      let count = 0;
      let batch: string[] = [];
      for await (const key of client.scanIterator({
        MATCH: pattern,
        COUNT: DELETE_ALL_BATCH_SIZE,
      })) {
        batch.push(key);
        if (batch.length >= DELETE_ALL_BATCH_SIZE) {
          count += await client.del(batch);
          batch = [];
        }
      }
      if (batch.length > 0) {
        count += await client.del(batch);
      }
      return count;
    }
  );

  logger.info(
    { redisKeyPattern: pattern, deletedCount },
    "Poke cache bulk invalidation performed"
  );

  return ctx.json({
    pattern,
    deletedCount,
  });
});

export default app;
