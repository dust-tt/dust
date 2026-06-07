/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import {
  getMembersUsage,
  MembersUsagePaginationSchema,
} from "@app/lib/api/credits/members_usage";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMembersUsageResponseBody>>,
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

  if (!auth.workspace() || !auth.isDustSuperUser()) {
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

  const paginationRes = MembersUsagePaginationSchema.safeParse(req.query);
  if (!paginationRes.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid pagination parameters: ${fromError(paginationRes.error).toString()}`,
      },
    });
  }

  const body = await getMembersUsage({
    auth,
    paginationParams: paginationRes.data,
    includeAlertLinks: true,
    includeSeatBalance: true,
  });

  return res.status(200).json(body);
}

export default withSessionAuthenticationForPoke(handler);
