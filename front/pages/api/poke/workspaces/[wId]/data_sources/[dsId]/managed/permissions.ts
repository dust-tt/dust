/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import {
  getManagedDataSourcePermissions,
  ManagedPermissionsQuerySchema,
  type ManagedPermissionsResponse,
} from "@app/lib/api/data_sources/managed_permissions";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ManagedPermissionsResponse>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

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

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
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

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const q = ManagedPermissionsQuerySchema.safeParse(req.query);
  if (!q.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${fromError(q.error).toString()}`,
      },
    });
  }

  const result = await getManagedDataSourcePermissions(
    dataSource.connectorId,
    q.data
  );

  if (result.isErr()) {
    switch (result.error.type) {
      case "connector_rate_limit":
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message:
              "Rate limit error while retrieving the data source permissions",
          },
        });
      case "connector_authorization_error":
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Authorization error while retrieving the data source permissions.",
          },
        });
      case "internal_error":
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              "An error occurred while retrieving the data source permissions.",
          },
        });
      default:
        assertNever(result.error);
    }
  }

  res.status(200).json(result.value);
}

export default withSessionAuthenticationForPoke(handler);
