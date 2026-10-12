import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentSuggestedPromptsResponseBody } from "@app/types/api/assistant/configuration/suggested_prompts";
import { PutAgentSuggestedPromptsRequestBodySchema } from "@app/types/api/assistant/configuration/suggested_prompts";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import {
  ARCHIVED_AGENT_API_ERROR,
  isArchivedAgent,
} from "@front-api/routes/w/[wId]/assistant/agent_configurations/guards";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<AgentSuggestedPromptsResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent || !auth.can("read", agent)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    return ctx.json({
      suggestedPrompts: await agent.listSuggestedPrompts(auth),
    });
  }
);

/** @ignoreswagger */
app.put(
  "/",
  withFeatureFlag("discovery_homepage"),
  validate("param", ParamsSchema),
  validate("json", PutAgentSuggestedPromptsRequestBodySchema),
  async (ctx): HandlerResult<AgentSuggestedPromptsResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");
    const { suggestedPrompts } = ctx.req.valid("json");

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    if (isArchivedAgent(agent)) {
      return apiError(ctx, ARCHIVED_AGENT_API_ERROR);
    }

    if (!auth.can("write", agent)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can modify the agent's suggested prompts.",
        },
      });
    }

    await agent.setSuggestedPrompts(auth, suggestedPrompts);

    return ctx.json({ suggestedPrompts });
  }
);

export default app;
