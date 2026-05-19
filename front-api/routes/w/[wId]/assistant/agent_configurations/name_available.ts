import { Hono } from "hono";
import { z } from "zod";

import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";

import { validate } from "@front-api/middleware/validator";

const GetAgentConfigurationNameIsAvailableSchema = z.object({
  handle: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/name_available.
const app = new Hono();

app.get(
  "/",
  validate("query", GetAgentConfigurationNameIsAvailableSchema),
  async (c) => {
    const auth = c.get("auth");
    const { handle } = c.req.valid("query");

    const sId = await getAgentIdFromName(auth, handle);
    return c.json({ available: sId === null });
  }
);

export default app;
