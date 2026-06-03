import {
  getWorkspaceCreditPoolStatus,
  getWorkspaceProgrammaticCreditStatus,
  isUserAwuWarned,
  isUserBlocked,
  isWorkspaceProgrammaticWarned,
} from "@app/lib/metronome/user_block";
import type { WorkspacePoolCreditState } from "@app/types/credits";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type ProgrammaticCreditStatus = "active" | "warned" | "depleted";

export type GetWorkspaceUsageStatusResponseBody = {
  awuStatus: "normal" | "warned" | "blocked";
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditStatus: ProgrammaticCreditStatus;
};

// Mounted at /api/w/:wId/usage-status.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetWorkspaceUsageStatusResponseBody> => {
    const auth = ctx.get("auth");
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    // Workspaces not on Metronome billing have no usage status to report.
    if (!workspace.metronomeCustomerId) {
      return ctx.json({
        awuStatus: "normal",
        poolCreditState: "active",
        programmaticCreditStatus: "active",
      });
    }

    const [poolCreditState, blockedReason, programmaticState] =
      await Promise.all([
        getWorkspaceCreditPoolStatus(workspace.sId),
        isUserBlocked(workspace.sId, user.sId),
        getWorkspaceProgrammaticCreditStatus(workspace.sId),
      ]);

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

    return ctx.json({ awuStatus, poolCreditState, programmaticCreditStatus });
  }
);

export default app;
