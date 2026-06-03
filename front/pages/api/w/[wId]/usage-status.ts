// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  getWorkspaceCreditPoolStatus,
  getWorkspaceProgrammaticCreditStatus,
  isUserAwuWarned,
  isUserBlocked,
  isWorkspaceProgrammaticWarned,
} from "@app/lib/metronome/user_block";
import { apiError } from "@app/logger/withlogging";
import type { WorkspacePoolCreditState } from "@app/types/credits";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type ProgrammaticCreditStatus = "active" | "warned" | "depleted";

export type GetWorkspaceUsageStatusResponseBody = {
  awuStatus: "normal" | "warned" | "blocked";
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditStatus: ProgrammaticCreditStatus;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceUsageStatusResponseBody>
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
  const user = auth.getNonNullableUser();

  // Workspaces not on Metronome billing have no usage status to report.
  if (!workspace.metronomeCustomerId) {
    return res.status(200).json({
      awuStatus: "normal",
      poolCreditState: "active",
      programmaticCreditStatus: "active",
    });
  }

  const [poolCreditState, blockedReason, programmaticState] = await Promise.all(
    [
      getWorkspaceCreditPoolStatus(workspace.sId),
      isUserBlocked(workspace.sId, user.sId),
      getWorkspaceProgrammaticCreditStatus(workspace.sId),
    ]
  );

  let awuStatus: GetWorkspaceUsageStatusResponseBody["awuStatus"] = "normal";
  if (blockedReason === "user_cap_reached") {
    awuStatus = "blocked";
  } else if (await isUserAwuWarned(workspace.sId, user.sId)) {
    awuStatus = "warned";
  }

  let programmaticCreditStatus: ProgrammaticCreditStatus = "active";
  if (programmaticState === "depleted") {
    programmaticCreditStatus = "depleted";
  } else if (await isWorkspaceProgrammaticWarned(workspace.sId)) {
    programmaticCreditStatus = "warned";
  }

  return res
    .status(200)
    .json({ awuStatus, poolCreditState, programmaticCreditStatus });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
