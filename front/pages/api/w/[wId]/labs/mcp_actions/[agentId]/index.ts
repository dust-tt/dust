import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NumberFromString, withFallback } from "io-ts-types";
import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import { MCPActionType } from "@app/lib/actions/mcp";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import {
  ConversationModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const GetMCPActionsQuerySchema = t.type({
  agentId: t.string,
  limit: withFallback(
    t.refinement(
      NumberFromString,
      (n): n is number => n >= 1 && n <= 100,
      `LimitWithRange`
    ),
    25
  ),
  cursor: t.union([t.string, t.undefined]),
});

export type GetMCPActionsResponseBody = {
  actions: Array<{
    sId: string;
    createdAt: string;
    functionCallName: string | null;
    params: Record<string, unknown>;
    executionState: string;
    isError: boolean;
    conversationId: string;
    messageId: string;
  }>;
  nextCursor: string | null;
  totalCount: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPActionsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const queryValidation = GetMCPActionsQuerySchema.decode({
        ...req.query,
        limit: req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined,
      });

      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { agentId, limit, cursor } = queryValidation.right;

      const owner = auth.getNonNullableWorkspace();
      const flags = await getFeatureFlags(owner);
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
      const agentConfiguration = await getAgentConfiguration(
        auth,
        agentId,
        "light"
      );
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent you're trying to access was not found.",
          },
        });
      }

      const whereClause: any = {
        workspaceId: owner.id,
      };

      if (cursor) {
        const cursorDate = new Date(cursor);
        if (isNaN(cursorDate.getTime())) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid cursor format.",
            },
          });
        }
        whereClause.createdAt = {
          [Op.lt]: cursorDate,
        };
      }

      let mcpActions;
      let totalCount;
      try {
        // Get total count for pagination
        totalCount = await AgentMCPAction.count({
          include: [
            {
              model: AgentMessage,
              as: "agent_message",
              required: true,
              where: {
                agentConfigurationId: agentConfiguration.sId,
              },
              include: [
                {
                  model: Message,
                  as: "message",
                  required: true,
                  include: [
                    {
                      model: ConversationModel,
                      as: "conversation",
                      required: true,
                      where: {
                        visibility: { [Op.ne]: "deleted" },
                      },
                    },
                  ],
                },
              ],
            },
          ],
          where: {
            workspaceId: owner.id,
          },
        });

        // Get all MCP actions for the specific agent with conversation info and limit
        mcpActions = await AgentMCPAction.findAll({
          include: [
            {
              model: AgentMessage,
              as: "agent_message",
              required: true,
              where: {
                agentConfigurationId: agentConfiguration.sId,
              },
              include: [
                {
                  model: Message,
                  as: "message",
                  required: true,
                  include: [
                    {
                      model: ConversationModel,
                      as: "conversation",
                      required: true,
                      where: {
                        visibility: { [Op.ne]: "deleted" },
                      },
                    },
                  ],
                },
              ],
            },
          ],
          where: whereClause,
          order: [["createdAt", "DESC"]],
          limit: limit + 1, // Fetch one extra to determine if there are more results
        });
      } catch (error) {
        logger.error(
          {
            workspaceId: owner.id,
            agentId,
            error,
          },
          "Failed to fetch MCP actions from database"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch MCP actions from database.",
          },
        });
      }

      // Determine if there are more results and get the actual results
      const hasMore = mcpActions.length > limit;
      const actualActions = hasMore ? mcpActions.slice(0, limit) : mcpActions;
      const nextCursor = hasMore
        ? actualActions[actualActions.length - 1].createdAt.toISOString()
        : null;

      const actionsData = actualActions.map((action) => {
        const agentMessage = (action as any).agent_message;
        return {
          sId: MCPActionType.modelIdToSId({
            id: action.id,
            workspaceId: owner.id,
          }),
          createdAt: action.createdAt.toISOString(),
          functionCallName: action.functionCallName,
          params: action.params,
          executionState: action.executionState,
          isError: action.isError,
          conversationId: agentMessage?.message?.conversation?.sId || "",
          messageId: agentMessage?.message?.sId || "",
        };
      });

      return res.status(200).json({
        actions: actionsData,
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
