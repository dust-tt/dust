import { runOnRedis, runOnRedisCache } from "@app/lib/api/redis";
import logger from "@app/logger/logger";
import type {
  DeleteAllPokeCacheResponseBody,
  DeletePokeCacheResponseBody,
  GetPokeCacheResponseBody,
  RedisCacheResult,
} from "@app/types/api/poke/cache";
import { isString } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { getPokeCacheOperations } from "@front-api/lib/api/poke/cache_catalog";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";
import mapValues from "lodash/mapValues";
import { z } from "zod";

import catalog from "./catalog";

// Mounted at /api/poke/cache. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

app.route("/catalog", catalog);

function resolveCacheKey(
  ctx: Context
):
  | { cacheKey: string; cacheKeysToDelete: string[] }
  | { err: ReturnType<typeof apiError> } {
  const resourceId = ctx.req.query("resourceId");
  const rawKey = ctx.req.query("rawKey");
  const params = ctx.req.query("params");

  if (isString(resourceId)) {
    const operations = getPokeCacheOperations(resourceId);
    if (!operations) {
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

    let rawParams: unknown;
    try {
      rawParams = JSON.parse(isString(params) ? params : "{}");
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

    const parsedParamsResult = z.record(z.string()).safeParse(rawParams);
    if (!parsedParamsResult.success) {
      return {
        err: apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The 'params' query parameter must contain strings.",
          },
        }),
      };
    }
    const parsedParams = parsedParamsResult.data;

    const missingKeys = operations.description.params
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

    try {
      return {
        cacheKey: operations.buildKey(parsedParams),
        cacheKeysToDelete: operations.buildKeysToDelete(parsedParams),
      };
    } catch {
      return {
        err: apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid cache resource parameters.",
          },
        }),
      };
    }
  }

  if (isString(rawKey)) {
    return { cacheKey: rawKey, cacheKeysToDelete: [rawKey] };
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

function decodeCacheValue(rawValue: string): unknown {
  const parsed = safeParseJSON(rawValue);

  return parsed.isOk() ? parsed.value : rawValue;
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
      const keyType = await client.type(cacheKey);
      const ttl = await client.ttl(cacheKey);

      if (keyType === "hash") {
        const fields = await client.hGetAll(cacheKey);

        return { value: mapValues(fields, decodeCacheValue), ttlSeconds: ttl };
      }

      const rawValue = await client.get(cacheKey);

      return {
        value: rawValue === null ? null : decodeCacheValue(rawValue),
        ttlSeconds: ttl,
      };
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
  const { cacheKey, cacheKeysToDelete } = r;

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
    await Promise.all(cacheKeysToDelete.map((key) => client.del(key)));
  });

  logger.info(
    { redisKeys: cacheKeysToDelete, redisInstance },
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
app.delete(
  "/all",
  async (ctx): HandlerResult<DeleteAllPokeCacheResponseBody> => {
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

    const operations = getPokeCacheOperations(resourceId);
    if (!operations) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Unknown resource ID: '${resourceId}'.`,
        },
      });
    }

    const patterns = operations.keyPatternsToDelete;
    if (patterns.length === 0) {
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
        for (const pattern of patterns) {
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
        }
        if (batch.length > 0) {
          count += await client.del(batch);
        }
        return count;
      }
    );

    logger.info(
      { redisKeyPatterns: patterns, deletedCount },
      "Poke cache bulk invalidation performed"
    );

    return ctx.json({
      pattern: operations.keyPattern ?? patterns[0],
      deletedCount,
    });
  }
);

export default app;
