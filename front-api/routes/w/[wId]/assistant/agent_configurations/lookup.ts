import { Hono } from "hono";
import { z } from "zod";

import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

const GetLookupRequestSchema = z.object({
  handle: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/lookup.
const app = new Hono();

app.get("/", validate("query", GetLookupRequestSchema), async (c) => {
  const auth = c.get("auth");
  const { handle } = c.req.valid("query");

  const sId = await getAgentIdFromName(auth, handle);
  if (!sId) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The Agent you're trying to access was not found.",
      },
    });
  }

  return c.json({ sId });
});

export default app;
