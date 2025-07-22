import assert from "assert";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

import { MCPActionType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import {
  ConversationModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

// AgentMCPAction serialized for analytics purposes.
export type AnalyticsMCPAction = {
  sId: string;
  createdAt: string;
  functionCallName: string | null;
  params: Record<string, unknown>;
  executionState: string;
  isError: boolean;
  conversationId: string;
  messageId: string;
};

export type GetMCPActionsResult = {
  actions: AnalyticsMCPAction[];
  nextCursor: string | null;
  totalCount: number;
};

type GetMCPActionsOptions = {
  agentConfigurationId: string;
  limit: number;
  cursor?: string;
};

export class AgentMCPActionsAnalytics {
  static async getMCPActionsForAgent(
    auth: Authenticator,
    { agentConfigurationId, limit, cursor }: GetMCPActionsOptions
  ): Promise<Result<GetMCPActionsResult, Error>> {
    const owner = auth.getNonNullableWorkspace();

    const whereClause: WhereOptions<AgentMCPAction> = {
      workspaceId: owner.id,
    };

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) {
        return new Err(new Error("Invalid cursor format"));
      }
      whereClause.createdAt = {
        [Op.lt]: cursorDate,
      };
    }

    try {
      // Get total count for pagination
      const totalCount = await AgentMCPAction.count({
        include: [
          {
            model: AgentMessage,
            as: "agentMessage",
            required: true,
            where: {
              agentConfigurationId: agentConfigurationId,
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
      const mcpActions = await AgentMCPAction.findAll({
        include: [
          {
            model: AgentMessage,
            as: "agentMessage",
            required: true,
            where: {
              agentConfigurationId: agentConfigurationId,
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

      // Determine if there are more results and get the actual results
      const hasMore = mcpActions.length > limit;
      const actualActions = hasMore ? mcpActions.slice(0, limit) : mcpActions;
      const nextCursor = hasMore
        ? actualActions[actualActions.length - 1].createdAt.toISOString()
        : null;

      const actionsData = actualActions.map((a) => serializeMCPAction(a));

      return new Ok({
        actions: actionsData,
        nextCursor,
        totalCount,
      });
    } catch (error) {
      logger.error(
        {
          workspaceId: owner.id,
          agentConfigurationId,
          error,
        },
        "Failed to fetch MCP actions from database"
      );
      return new Err(new Error("Failed to fetch MCP actions from database"));
    }
  }
}

function serializeMCPAction(action: AgentMCPAction): AnalyticsMCPAction {
  assert(action.agentMessage, "Agent message must exist");
  assert(action.agentMessage.message, "Message must exist");
  assert(action.agentMessage.message.conversation, "Conversation must exist");

  return {
    sId: MCPActionType.modelIdToSId({
      id: action.id,
      workspaceId: action.workspaceId,
    }),
    createdAt: action.createdAt.toISOString(),
    functionCallName: action.functionCallName,
    params: action.params,
    executionState: action.executionState,
    isError: action.isError,
    conversationId: action.agentMessage.message.conversation.sId,
    messageId: action.agentMessage.message.sId,
  };
}
