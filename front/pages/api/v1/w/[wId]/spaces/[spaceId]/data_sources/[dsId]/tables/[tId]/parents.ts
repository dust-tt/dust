import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { CoreAPI } from "@app/types/core/core_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { PostParentsResponseType } from "@dust-tt/client";
import { PostTableParentsRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,

  res: NextApiResponse<WithAPIErrorResponse<PostParentsResponseType>>,
  auth: Authenticator,
  { dataSource }: { dataSource: DataSourceResource }
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const { tId } = req.query;
  if (!isString(tId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const r = PostTableParentsRequestSchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      const { parents, parent_id: parentId } = r.data;

      // Enforce parents consistency: parents[0] === documentId, parents[1] === parentId (or there is no parents[1] and parentId is null).
      if (parents.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents must have at least one element.`,
          },
        });
      }
      if (parents[0] !== tId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents[0] should be equal to table_id.`,
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

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const updateRes = await coreAPI.updateTableParents({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        tableId: tId,
        parentId: parentId ?? null,
        parents,
      });

      if (updateRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error updating the `parents` field.",
            data_source_error: updateRes.error,
          },
        });
      }

      res.status(200).json({ updated: true });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    dataSource: { requireCanRead: true },
  })
);
