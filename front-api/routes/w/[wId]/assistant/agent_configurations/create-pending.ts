import { createPendingAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type PostPendingAgentResponseBody = {
  sId: string;
};

// Mounted at /api/w/:wId/assistant/agent_configurations/create-pending.
const app = workspaceApp();

app.post("/", async (ctx): HandlerResult<PostPendingAgentResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.user()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "You must be authenticated to create a pending agent.",
      },
    });
  }

  const { sId } = await createPendingAgentConfiguration(auth);
  return ctx.json({ sId });
});

export default app;
