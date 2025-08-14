import assert from "assert";
import type { Transaction } from "sequelize";

import { MCPActionType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { MCPActionValidationRequest, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMCPActionResource
  extends ReadonlyAttributesType<AgentMCPAction> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMCPActionResource extends BaseResource<AgentMCPAction> {
  static model: ModelStaticWorkspaceAware<AgentMCPAction> = AgentMCPAction;

  private static async baseFetch(
    auth: Authenticator,
    { where, limit, order }: ResourceFindOptions<AgentMCPAction> = {}
  ) {
    const actions = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      limit,
      order,
    });
    return actions.map((a) => new this(this.model, a.get()));
  }

  static async listPendingValidationsForConversation(
    auth: Authenticator,
    conversationId: string
  ): Promise<MCPActionValidationRequest[]> {
    const owner = auth.getNonNullableWorkspace();

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversation) {
      return [];
    }

    const pendingActions = await AgentMCPAction.findAll({
      include: [
        {
          model: AgentMessage,
          as: "agentMessage",
          required: true,
          include: [
            {
              model: Message,
              as: "message",
              required: true,
              where: {
                conversationId: conversation.id,
              },
            },
          ],
        },
      ],
      where: {
        workspaceId: owner.id,
        executionState: "pending",
      },
      order: [["createdAt", "ASC"]],
    });

    const pendingValidations: MCPActionValidationRequest[] = [];

    for (const action of pendingActions) {
      const agentMessage = action.agentMessage;
      assert(agentMessage?.message, "No message for agent message.");

      const mcpAction = new MCPActionType(auth, {
        id: action.id,
        agentMessageId: action.agentMessageId,
        generatedFiles: [],
        mcpServerConfigurationId: action.mcpServerConfigurationId,
        mcpServerId: null,
        executionState: action.executionState,
        isError: action.isError,
        params: action.augmentedInputs || {},
        output: null,
        // All of these we don't have as they would require fetching the AgentStepContentResource.
        // This fetch is not very expensive (PK), but it's also not necessary at all here
        // as we won't even read these fields ultimately.
        // Bottom line is that we need to get rid of MCPActionType and move everything from there
        // to this resource but this will be done in a follow-up PR to split the work.
        functionCallId: null,
        functionCallName: null,
        step: -1,
        citationsAllocated: action.citationsAllocated,
        toolConfiguration: action.toolConfiguration,
        type: "tool_action" as const,
      });

      pendingValidations.push({
        messageId: agentMessage.message.sId,
        conversationId,
        actionId: mcpAction.sId,
        inputs: action.augmentedInputs || {},
        stake: action.toolConfiguration?.permission,
        metadata: {
          toolName:
            action.toolConfiguration?.originalName ||
            action.toolConfiguration?.name,
          mcpServerName: action.toolConfiguration?.mcpServerName,
          agentName: agentMessage.agentConfigurationId,
          icon: action.toolConfiguration?.icon,
        },
        action: mcpAction,
      });
    }

    return pendingValidations;
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await AgentMCPAction.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }
}
