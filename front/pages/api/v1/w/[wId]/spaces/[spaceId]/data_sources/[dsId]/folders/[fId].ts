import type {
  DeleteFolderResponseType,
  GetFolderResponseType,
  UpsertFolderResponseType,
} from "@dust-tt/client";
import { UpsertDataSourceFolderRequestSchema } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI, rateLimiter } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError, statsDClient } from "@app/logger/withlogging";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetFolderResponseType
      | DeleteFolderResponseType
      | UpsertFolderResponseType
    >
  >,
  auth: Authenticator,
  dataSource: DataSourceResource
): Promise<void> {
  const { fId } = req.query;

  if (typeof fId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  switch (req.method) {
    case "GET":
      const docRes = await coreAPI.getDataSourceFolder({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        folderId: fId,
      });

      if (docRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source folder.",
            data_source_error: docRes.error,
          },
        });
      }

      res.status(200).json({
        folder: docRes.value.folder,
      });
      return;

    case "POST":
      if (dataSource.connectorId && !auth.isSystemKey()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot upsert a folder on a managed data source.",
          },
        });
      }

      if (!auth.isSystemKey()) {
        const remaining = await rateLimiter({
          key: `upsert-folder-w-${owner.sId}`,
          maxPerTimeframe: 120,
          timeframeSeconds: 60,
          logger,
        });
        if (remaining <= 0) {
          return apiError(req, res, {
            status_code: 429,
            api_error: {
              type: "rate_limit_error",
              message: `You have reached the maximum number of 120 upserts per minute.`,
            },
          });
        }
      }

      const r = UpsertDataSourceFolderRequestSchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${r.error.message}`,
          },
        });
      }

      const statsDTags = [
        `data_source_id:${dataSource.id}`,
        `workspace_id:${owner.sId}`,
        `data_source_name:${dataSource.name}`,
        `folder_id:${fId}`,
      ];
      if (!r.data.parents || r.data.parents.length === 0) {
        statsDClient.increment("folder_empty_parents.count", 1, statsDTags);
      } else if (r.data.parents[0] != fId) {
        statsDClient.increment("folder_no_self_ref.count", 1, statsDTags);
      }

      // Create folder with the Dust internal API.
      const upsertRes = await coreAPI.upsertDataSourceFolder({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        folderId: fId,
        timestamp: r.data.timestamp || null,
        parents: r.data.parents || [fId],
        title: r.data.title,
      });

      if (upsertRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error upserting the folder.",
            data_source_error: upsertRes.error,
          },
        });
      }

      res.status(200).json({
        folder: upsertRes.value.folder,
        data_source: dataSource.toJSON(),
      });
      return;

    case "DELETE":
      if (dataSource.connectorId && !auth.isSystemKey()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot delete a folder from a managed data source.",
          },
        });
      }

      const delRes = await coreAPI.deleteDataSourceFolder({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        folderId: fId,
      });

      if (delRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error deleting the folder.",
            data_source_error: delRes.error,
          },
        });
      }

      res.status(200).json({
        folder: {
          folder_id: fId,
        },
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST, or DELETE is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, "dataSource")
);
