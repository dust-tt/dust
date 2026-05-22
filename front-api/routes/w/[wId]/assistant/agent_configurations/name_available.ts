import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type GetAgentNameIsAvailableResponseBody = {
  available: boolean;
};

const GetAgentConfigurationNameIsAvailableSchema = z.object({
  handle: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/name_available.
const app = workspaceApp();

app.get(
  "/",
  validate("query", GetAgentConfigurationNameIsAvailableSchema),
  async (ctx): HandlerResult<GetAgentNameIsAvailableResponseBody> => {
    const auth = ctx.get("auth");
    const { handle } = ctx.req.valid("query");

    const sId = await getAgentIdFromName(auth, handle);
    return ctx.json({ available: sId === null });
  }
);

export default app;
