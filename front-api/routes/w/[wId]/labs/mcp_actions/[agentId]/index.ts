import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { AgentMCPActionType } from "@app/types/actions";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_is_admin";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import assert from "assert";
import { z } from "zod";

export type GetMCPActionsResult = {
  actions: (AgentMCPActionType & {
    conversationId: string;
    messageId: string;
  })[];
  nextCursor: string | null;
  totalCount: number;
};

const GetMCPActionsParamSchema = z.object({
  agentId: z.string(),
});

const GetMCPActionsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .refine((n) => n >= 1 && n <= 100, { message: `LimitWithRange` })
    .default(25),
  cursor: z.string().optional(),
});

// Mounted at /api/w/:wId/labs/mcp_actions/:agentId.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  validate("param", GetMCPActionsParamSchema),
  validate("query", GetMCPActionsQuerySchema),
  async (ctx): HandlerResult<GetMCPActionsResult> => {
    const auth = ctx.get("auth");
    const { agentId } = ctx.req.valid("param");
    const { limit, cursor } = ctx.req.valid("query");

    let cursorDate: Date | undefined;
    if (cursor) {
      cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid cursor format.",
          },
        });
      }
    }

    const flags = await getFeatureFlags(auth);
    if (!flags.includes("labs_mcp_actions_dashboard")) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "feature_flag_not_found",
          message: "MCP Actions dashboard is not available.",
        },
      });
    }

    // Verify the agent exists and user has access
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId,
      variant: "light",
    });
    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent you're trying to access was not found.",
        },
      });
    }

    const { data, totalCount, nextCursor } =
      await AgentStepContentResource.listFunctionCallsForAgent(auth, {
        agentConfiguration,
        limit,
        cursor: cursorDate,
      });

    const contentById = new Map(data.map((s) => [s.stepContent.id, s]));

    const actions = await AgentMCPActionResource.fetchByStepContents(auth, {
      stepContents: data.map((s) => s.stepContent),
    });

    const resultActions = actions.map((a) => {
      const stepContent = contentById.get(a.stepContent.id);
      assert(stepContent, "Step content not found.");

      return {
        ...a.toJSON(),
        conversationId: stepContent.conversationId,
        messageId: stepContent.messageId,
      };
    });

    return ctx.json({
      actions: resultActions,
      nextCursor,
      totalCount,
    });
  }
);

export default app;
