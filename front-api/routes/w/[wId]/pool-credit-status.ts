import { getWorkspaceCreditPoolStatus } from "@app/lib/metronome/user_block";
import type { WorkspacePoolCreditState } from "@app/types/credits";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetWorkspacePoolCreditStatusResponseBody = {
  poolCreditState: WorkspacePoolCreditState;
};

// Mounted at /api/w/:wId/pool-credit-status.
const app = workspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetWorkspacePoolCreditStatusResponseBody> => {
    const auth = ctx.get("auth");
    const workspace = auth.getNonNullableWorkspace();

    // Workspaces not on Metronome billing have no pool credit state to report.
    if (!workspace.metronomeCustomerId) {
      return ctx.json({ poolCreditState: "active" });
    }

    const poolCreditState = await getWorkspaceCreditPoolStatus(workspace.sId);

    return ctx.json({ poolCreditState });
  }
);

export default app;
