import {
  getWorkspaceProgrammaticCreditStatus,
  isWorkspaceProgrammaticWarned,
} from "@app/lib/metronome/alerts/programmatic_cap";
import {
  getWorkspaceCreditPoolStatus,
  isUserAwuWarned,
  isUserBlocked,
} from "@app/lib/metronome/user_block";
import type {
  WorkspacePoolCreditState,
  WorkspaceProgrammaticCreditState,
} from "@app/types/credits";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetWorkspaceUsageStatusResponseBody = {
  awuStatus: "normal" | "warned" | "blocked";
  poolCreditState: WorkspacePoolCreditState;
  programmaticCreditState: WorkspaceProgrammaticCreditState;
  programmaticWarned: boolean;
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
        programmaticCreditState: "active",
        programmaticWarned: false,
      });
    }

    const [
      poolCreditState,
      programmaticCreditState,
      blockedReason,
      programmaticWarned,
    ] = await Promise.all([
      getWorkspaceCreditPoolStatus(workspace.sId),
      getWorkspaceProgrammaticCreditStatus(workspace.sId),
      isUserBlocked(workspace.sId, user.sId),
      isWorkspaceProgrammaticWarned(workspace.sId),
    ]);

    let awuStatus: GetWorkspaceUsageStatusResponseBody["awuStatus"] = "normal";
    if (blockedReason === "user_cap_reached") {
      awuStatus = "blocked";
    } else if (await isUserAwuWarned(workspace.sId, user.sId)) {
      awuStatus = "warned";
    }

    return ctx.json({
      awuStatus,
      poolCreditState,
      programmaticCreditState,
      programmaticWarned,
    });
  }
);

export default app;
