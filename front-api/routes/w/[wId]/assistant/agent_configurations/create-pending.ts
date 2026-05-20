import { createPendingAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/agent_configurations/create-pending.
const app = new Hono();

app.post("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.user()) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "You must be authenticated to create a pending agent.",
      },
    });
  }

  const { sId } = await createPendingAgentConfiguration(auth);
  return c.json({ sId });
});

export default app;
