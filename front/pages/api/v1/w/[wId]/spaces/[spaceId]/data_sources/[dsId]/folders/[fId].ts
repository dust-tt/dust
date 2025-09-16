import type {
  DeleteFolderResponseType,
  GetFolderResponseType,
  UpsertFolderResponseType,
} from "@dust-tt/client";
import { UpsertDataSourceFolderRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { CoreAPI } from "@app/types";

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
  { dataSource }: { dataSource: DataSourceResource }
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
      if (!dataSource.canReadOrAdministrate(auth)) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        });
      }

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
      // To write we must have canWrite or be a systemAPIKey
      if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
          },
        });
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

      const {
        timestamp,
        parent_id: parentId,
        parents,
        title,
        mime_type,
        source_url,
        provider_visibility,
      } = r.data;
      if (parentId && parents && parents[1] !== parentId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: parents[1] and parent_id should be equal`,
          },
        });
      }

      // Enforce parents consistency: we expect users to either not pass them (recommended) or pass them correctly.
      if (parents) {
        if (parents.length === 0) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid parents: parents must have at least one element.`,
            },
          });
        }
        if (parents[0] !== fId) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid parents: parents[0] should be equal to document_id.`,
            },
          });
        }
        if (
          (parents.length >= 2 || parentId !== null) &&
          parents[1] !== parentId
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid parent id: parents[1] and parent_id should be equal.`,
            },
          });
        }
      }

      // Create folder with the Dust internal API.
      const upsertRes = await coreAPI.upsertDataSourceFolder({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        folderId: fId,
        timestamp: timestamp || null,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        parentId: parentId || null,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        parents: parents || [fId],
        title: title.trim() || "Untitled Folder",
        mimeType: mime_type,
        sourceUrl: source_url ?? null,
        providerVisibility: provider_visibility,
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
      // To write we must have canWrite or be a systemAPIKey
      if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
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
  withResourceFetchingFromRoute(handler, {
    dataSource: { requireCanReadOrAdministrate: true },
  })
);
