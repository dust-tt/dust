import type { GetFairUseCreditsResponseBody } from "@app/lib/metronome/user_block";
import { getFairUseAwuCreditsStatus } from "@app/lib/metronome/user_block";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/fair-use-credits.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetFairUseCreditsResponseBody> => {
  const auth = ctx.get("auth");
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const fairUseAwuCreditsState = await getFairUseAwuCreditsStatus({
    workspace,
    user: user.toJSON(),
    plan: auth.plan(),
  });

  return ctx.json({ fairUseAwuCreditsState });
});

export default app;
