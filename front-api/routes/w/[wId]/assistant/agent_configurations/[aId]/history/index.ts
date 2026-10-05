import { AgentResource } from "@app/lib/resources/agent_resource";
import { toLightAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import { GetAgentConfigurationsHistoryQuerySchema } from "@app/types/api/agent_configuration";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const ParamsSchema = z.object({
  aId: z.string(),
});

export type GetAgentConfigurationsResponseBody = {
  history: LightAgentConfigurationType[];
};

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/history.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetAgentConfigurationsResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent || !auth.can("read", agent)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent you're trying to access was not found.",
        },
      });
    }

    // The schema expects `limit` as a number; query params arrive as strings,
    // so we parseInt before validation.
    const queryRaw = ctx.req.query();
    const queryValidation = GetAgentConfigurationsHistoryQuerySchema.safeParse({
      ...queryRaw,
      limit:
        typeof queryRaw.limit === "string"
          ? parseInt(queryRaw.limit, 10)
          : undefined,
    });
    if (!queryValidation.success) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
        },
      });
    }

    const { limit } = queryValidation.data;

    const versions = await agent.listVersions(auth, { limit });

    return ctx.json({
      history: await toLightAgentConfigurations(auth, versions),
    });
  }
);

export default app;
