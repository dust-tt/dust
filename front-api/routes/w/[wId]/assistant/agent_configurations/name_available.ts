import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const GetAgentConfigurationNameIsAvailableSchema = z.object({
  handle: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/name_available.
const app = new Hono();

app.get(
  "/",
  validate("query", GetAgentConfigurationNameIsAvailableSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { handle } = ctx.req.valid("query");

    const sId = await getAgentIdFromName(auth, handle);
    return ctx.json({ available: sId === null });
  }
);

export default app;
