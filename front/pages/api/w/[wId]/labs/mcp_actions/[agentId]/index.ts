/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GetMCPActionsResult } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import assert from "assert";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const GetMCPActionsQuerySchema = z.object({
  agentId: z.string(),
  limit: z
    .number()
    .refine((n) => n >= 1 && n <= 100, { message: `LimitWithRange` })
    .default(25),
  cursor: z.string().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPActionsResult>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const queryValidation = GetMCPActionsQuerySchema.safeParse({
        ...req.query,
        limit: req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined,
      });

      if (!queryValidation.success) {
        const pathError = fromError(queryValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { agentId, limit, cursor } = queryValidation.data;

      let cursorDate: Date | undefined;
      if (cursor) {
        cursorDate = new Date(cursor);
        if (isNaN(cursorDate.getTime())) {
          return apiError(req, res, {
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
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "feature_flag_not_found",
            message: "MCP Actions dashboard is not available.",
          },
        });
      }

      // Only admins can access the MCP Actions Dashboard
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only workspace admins can access the MCP Actions Dashboard.",
          },
        });
      }

      // Verify the agent exists and user has access
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId,
        variant: "light",
      });
      if (!agentConfiguration) {
        return apiError(req, res, {
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

      return res.status(200).json({
        actions: resultActions,
        nextCursor,
        totalCount,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
