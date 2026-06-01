// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { isUserAwuWarned, isUserBlocked } from "@app/lib/metronome/user_block";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetUserAwuStatusResponseBody = {
  status: "normal" | "warned" | "blocked";
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetUserAwuStatusResponseBody>>,
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

  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  if (!workspace.metronomeCustomerId) {
    return res.status(200).json({ status: "normal" });
  }

  const blockedReason = await isUserBlocked(workspace.sId, user.sId);
  if (blockedReason === "user_cap_reached") {
    return res.status(200).json({ status: "blocked" });
  }

  const warned = await isUserAwuWarned(workspace.sId, user.sId);
  if (warned) {
    return res.status(200).json({ status: "warned" });
  }

  return res.status(200).json({ status: "normal" });
}

export default withSessionAuthenticationForWorkspace(handler);
