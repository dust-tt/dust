import type { Context } from "hono";
import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { syncNotionUrls } from "@app/lib/api/poke/plugins/data_sources/notion_url_sync";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceResource as DataSourceResourceClass } from "@app/lib/resources/data_source_resource";
import type { GetPostNotionSyncResponseBody } from "@app/types/api/internal/spaces";
import { PostNotionSyncPayloadSchema } from "@app/types/api/internal/spaces";

import { validate } from "@front-api/middleware/validator";

const RECENT_URLS_COUNT = 100;

function getRedisKeyForNotionUrlSync(workspaceId: string) {
  return `workspace:${workspaceId}:synced_urls`;
}

type FetchResult =
  | { kind: "ok"; dataSource: DataSourceResource }
  | {
      kind: "err";
      status: 400 | 403 | 404;
      type:
        | "data_source_not_found"
        | "data_source_not_managed"
        | "data_source_auth_error";
      message: string;
    };

async function fetchManagedNotionDataSource(
  auth: Authenticator,
  dsId: string
): Promise<FetchResult> {
  const dataSource = await DataSourceResourceClass.fetchById(auth, dsId);
  if (
    !dataSource ||
    !(await getFeatureFlags(auth)).includes("advanced_notion_management")
  ) {
    return {
      kind: "err",
      status: 404,
      type: "data_source_not_found",
      message: "The data source you requested was not found.",
    };
  }
  if (!dataSource.connectorId) {
    return {
      kind: "err",
      status: 400,
      type: "data_source_not_managed",
      message: "The data source you requested is not managed.",
    };
  }
  if (!dataSource.canAdministrate(auth) || !auth.isAdmin()) {
    return {
      kind: "err",
      status: 403,
      type: "data_source_auth_error",
      message:
        "Only the users that are `admins` for the current workspace can sync Notion URLs.",
    };
  }
  return { kind: "ok", dataSource };
}

function errorJson(c: Context, result: Extract<FetchResult, { kind: "err" }>) {
  return apiError(c, {
    status_code: result.status,
    api_error: { type: result.type, message: result.message },
  });
}

// Mounted at /api/w/:wId/data_sources/:dsId/managed/notion_url_sync.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const dsId = c.req.param("dsId") ?? "";

  const result = await fetchManagedNotionDataSource(auth, dsId);
  if (result.kind === "err") {
    return errorJson(c, result);
  }

  const owner = auth.getNonNullableWorkspace();
  const redisKey = getRedisKeyForNotionUrlSync(owner.sId);
  const lastSyncedUrls = (
    await runOnRedis({ origin: "notion_url_sync" }, async (redis) => {
      return redis.zRange(redisKey, 0, RECENT_URLS_COUNT - 1, { REV: true });
    })
  ).map((r): GetPostNotionSyncResponseBody["syncResults"][number] =>
    JSON.parse(r)
  );

  return c.json({ syncResults: lastSyncedUrls });
});

app.post("/", validate("json", PostNotionSyncPayloadSchema), async (c) => {
  const auth = c.get("auth");
  const dsId = c.req.param("dsId") ?? "";

  const result = await fetchManagedNotionDataSource(auth, dsId);
  if (result.kind === "err") {
    return errorJson(c, result);
  }

  const owner = auth.getNonNullableWorkspace();
  const { urls, method } = c.req.valid("json");

  const syncResults = (
    await syncNotionUrls({
      urlsArray: urls,
      dataSourceId: dsId,
      workspaceId: owner.sId,
      method,
    })
  ).map((urlResult) => ({
    url: urlResult.url,
    method,
    timestamp: urlResult.timestamp,
    success: urlResult.success,
    ...(urlResult.error && { error_message: urlResult.error.message }),
  }));

  // Store the last RECENT_URLS_COUNT synced urls (expires in 1 day if no URL is synced).
  await runOnRedis({ origin: "notion_url_sync" }, async (redis) => {
    const redisKey = getRedisKeyForNotionUrlSync(owner.sId);

    await redis.zAdd(
      redisKey,
      syncResults.map((urlResult) => ({
        method,
        score: urlResult.timestamp,
        value: JSON.stringify(urlResult),
      }))
    );

    await redis.expire(redisKey, 24 * 60 * 60);

    // Delete the oldest URL if the list has more than RECENT_URLS_COUNT items.
    const count = await redis.zCard(redisKey);
    if (count > RECENT_URLS_COUNT) {
      await redis.zRemRangeByRank(redisKey, 0, count - RECENT_URLS_COUNT);
    }
  });

  return c.json({ syncResults });
});

export default app;
