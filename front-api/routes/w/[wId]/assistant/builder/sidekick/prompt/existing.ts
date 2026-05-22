import { buildExistingAgentPrompt } from "@app/lib/api/assistant/builder/sidekick_prompts";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/assistant/builder/sidekick/prompt/existing.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const agentConfigurationId = ctx.req.query("agentConfigurationId");
  if (!agentConfigurationId) {
    return apiError(ctx, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message:
          "The agentConfigurationId query parameter is invalid or missing.",
      },
    });
  }

  return ctx.json(await buildExistingAgentPrompt(auth, agentConfigurationId));
});

export default app;
