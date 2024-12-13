import type {
  DeleteFolderResponseType,
  GetFolderResponseType,
  UpsertFolderResponseType,
} from "@dust-tt/client";
import { UpsertDataSourceFolderRequestSchema } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
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

  if (typeof fId !== "string" || fId === "") {
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
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const docRes = await coreAPI.getDataSourceFolder({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        folderId: fId,
      });

      if (docRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
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

      const { timestamp, parent_id: parentId, parents, title } = r.data;
      if (parentId && parents && parents[1] !== parentId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: parents[1] and parent_id should be equal`,
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
        timestamp: timestamp || null,
        parentId: parentId || null,
        parents: parents || [fId],
        title: title,
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
