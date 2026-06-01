// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import type { GetAwuUsageResponse } from "@app/lib/api/analytics/awu_usage";
import {
  AwuUsageQuerySchema,
  getAwuUsage,
} from "@app/lib/api/analytics/awu_usage";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAwuUsageResponse>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  const q = AwuUsageQuerySchema.safeParse(req.query);
  if (!q.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${q.error.message}`,
      },
    });
  }

  const result = await getAwuUsage(auth, q.data);
  if (result.isErr()) {
    const err = result.error;
    switch (err.type) {
      case "metronome_not_configured":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Workspace is not configured for Metronome billing.",
          },
        });
      case "invalid_group_key":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              `Grouping by "${err.groupBy}" is not available. The billable metric ` +
              `must have "${err.eventProperty}" configured as a group key in Metronome.`,
          },
        });
      case "internal_error":
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: err.message,
          },
        });
      default:
        assertNever(err);
    }
  }

  res.status(200).json(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
