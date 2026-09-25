import { getAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { GetAgentUsageResponseBody } from "@app/types/api/assistant/agent_usage";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetAgentUsageResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const { aId } = ctx.req.valid("param");

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent you're trying to access was not found.",
        },
      });
    }

    const agentUsage = await getAgentUsage(auth, {
      agent,
      workspaceId: owner.sId,
    });

    return ctx.json({ agentUsage });
  }
);

export default app;
