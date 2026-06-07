import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const GetLookupRequestSchema = z.object({
  handle: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/lookup.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("query", GetLookupRequestSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { handle } = ctx.req.valid("query");

  const sId = await getAgentIdFromName(auth, handle);
  if (!sId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The Agent you're trying to access was not found.",
      },
    });
  }

  return ctx.json({ sId });
});

export default app;
