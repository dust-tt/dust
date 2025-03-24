import { isLeft } from "fp-ts/lib/Either";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { syncNotionUrls } from "@app/lib/api/poke/plugins/data_sources/notion_url_sync";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  GetPostNotionSyncResponseBody,
  WithAPIErrorResponse,
} from "@app/types";
import { PostNotionSyncPayloadSchema } from "@app/types";

const RECENT_URLS_COUNT = 100;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPostNotionSyncResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  // fetchById enforces through auth the authorization (workspace here mainly).
  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  // endpoint protected by feature flag
  if (
    !dataSource ||
    !(await getFeatureFlags(owner)).includes("advanced_notion_management")
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source you requested is not managed.",
      },
    });
  }

  if (!dataSource.canAdministrate(auth) || !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can sync Notion URLs.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      // get the last 50 synced urls
      const redisKey = getRedisKeyForNotionUrlSync(owner.sId);
      const lastSyncedUrls = (
        await runOnRedis({ origin: "notion_url_sync" }, async (redis) => {
          const urls = await redis.zRange(redisKey, 0, RECENT_URLS_COUNT - 1, {
            REV: true,
          });
          return urls;
        })
      ).map((result): GetPostNotionSyncResponseBody["syncResults"][number] =>
        JSON.parse(result)
      );
      return res.status(200).json({ syncResults: lastSyncedUrls });
    case "POST":
      const bodyValidation = PostNotionSyncPayloadSchema.decode(req.body);

      if (isLeft(bodyValidation)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(bodyValidation.left).toString(),
          },
        });
      }

      const { urls, method } = bodyValidation.right;

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

      // Store the last RECENT_URLS_COUNT synced urls (expires in 1 day if no URL is synced)
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

        // Delete the oldest URL if the list has more than RECENT_URLS_COUNT items
        const count = await redis.zCard(redisKey);
        if (count > RECENT_URLS_COUNT) {
          await redis.zRemRangeByRank(redisKey, 0, count - RECENT_URLS_COUNT);
        }
      });

      res.status(200).json({ syncResults });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

function getRedisKeyForNotionUrlSync(workspaceId: string) {
  return `workspace:${workspaceId}:synced_urls`;
}

export default withSessionAuthenticationForWorkspace(handler);
