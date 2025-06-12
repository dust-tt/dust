import type { Attributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

import { MCPActionType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import {
  ConversationModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

type AgentMCPActionWithConversation = AgentMCPAction & {
  agent_message: AgentMessage & {
    message: Message & {
      conversation: ConversationModel;
    };
  };
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMCPActionResource
  extends ReadonlyAttributesType<AgentMCPAction> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMCPActionResource extends BaseResource<AgentMCPAction> {
  static model: ModelStatic<AgentMCPAction> = AgentMCPAction;

  constructor(
    model: ModelStatic<AgentMCPAction>,
    blob: Attributes<AgentMCPAction>
  ) {
    super(AgentMCPAction, blob);
  }

  async delete(): Promise<Result<undefined, Error>> {
    return new Err(
      new Error("Direct deletion of MCP actions is not supported")
    );
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: number;
    workspaceId: number;
  }): string {
    return MCPActionType.modelIdToSId({ id, workspaceId });
  }

  get sId(): string {
    return AgentMCPActionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  toJSON() {
    return {
      sId: this.sId,
      createdAt: this.createdAt.toISOString(),
      functionCallName: this.functionCallName,
      params: this.params,
      executionState: this.executionState,
      isError: this.isError,
    };
  }

  static async getMCPActionsForAgent(
    auth: Authenticator,
    { agentConfigurationId, limit, cursor }: GetMCPActionsOptions
  ): Promise<Result<GetMCPActionsResult, Error>> {
    const owner = auth.getNonNullableWorkspace();

    const whereClause: any = {
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
            as: "agent_message",
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
      const mcpActions = (await AgentMCPAction.findAll({
        include: [
          {
            model: AgentMessage,
            as: "agent_message",
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
      })) as AgentMCPActionWithConversation[];

      // Determine if there are more results and get the actual results
      const hasMore = mcpActions.length > limit;
      const actualActions = hasMore ? mcpActions.slice(0, limit) : mcpActions;
      const nextCursor = hasMore
        ? actualActions[actualActions.length - 1].createdAt.toISOString()
        : null;

      const actionsData: MCPAction[] = actualActions.map((action) => {
        const agentMessage = action.agent_message;
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
          conversationId: agentMessage.message.conversation.sId,
          messageId: agentMessage.message.sId,
        };
      });

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

export type MCPAction = {
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
  actions: MCPAction[];
  nextCursor: string | null;
  totalCount: number;
};

export type GetMCPActionsOptions = {
  agentConfigurationId: string;
  limit: number;
  cursor?: string;
};
