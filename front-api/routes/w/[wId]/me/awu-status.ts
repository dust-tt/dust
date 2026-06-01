import { isUserAwuWarned, isUserBlocked } from "@app/lib/metronome/user_block";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetUserAwuStatusResponseBody = {
  status: "normal" | "warned" | "blocked";
};

// Mounted at /api/w/:wId/me/awu-status.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetUserAwuStatusResponseBody> => {
  const auth = ctx.get("auth");
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  if (!workspace.metronomeCustomerId) {
    return ctx.json({ status: "normal" });
  }

  const blockedReason = await isUserBlocked(workspace.sId, user.sId);
  if (blockedReason === "user_cap_reached") {
    return ctx.json({ status: "blocked" });
  }

  const warned = await isUserAwuWarned(workspace.sId, user.sId);
  if (warned) {
    return ctx.json({ status: "warned" });
  }

  return ctx.json({ status: "normal" });
});

export default app;
