/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import type { GetAwuUsageResponse } from "@app/lib/api/analytics/awu_usage";
import {
  AwuUsageQuerySchema,
  getAwuUsage,
} from "@app/lib/api/analytics/awu_usage";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAwuUsageResponse>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to access was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Could not find the workspace.",
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

export default withSessionAuthenticationForPoke(handler);
