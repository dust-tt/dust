import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { buildExistingAgentPrompt } from "@app/lib/api/assistant/builder/sidekick_prompts";

// Mounted at /api/w/:wId/assistant/builder/sidekick/prompt/existing.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const agentConfigurationId = c.req.query("agentConfigurationId");
  if (!agentConfigurationId) {
    return apiError(c, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message:
          "The agentConfigurationId query parameter is invalid or missing.",
      },
    });
  }

  return c.json(await buildExistingAgentPrompt(auth, agentConfigurationId));
});

export default app;
