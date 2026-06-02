// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getWorkspaceCreditPoolStatus } from "@app/lib/metronome/user_block";
import { apiError } from "@app/logger/withlogging";
import type { WorkspacePoolCreditState } from "@app/types/credits";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetWorkspacePoolCreditStatusResponseBody = {
  poolCreditState: WorkspacePoolCreditState;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspacePoolCreditStatusResponseBody>
  >,
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

  // Workspaces not on Metronome billing have no pool credit state to report.
  if (!workspace.metronomeCustomerId) {
    return res.status(200).json({ poolCreditState: "active" });
  }

  const poolCreditState = await getWorkspaceCreditPoolStatus(workspace.sId);

  return res.status(200).json({ poolCreditState });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
