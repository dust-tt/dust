import assert from "assert";
import type { Attributes, NonAttribute, Transaction } from "sequelize";
import { Op } from "sequelize";

import { TOOL_EXECUTION_BLOCKED_STATUSES } from "@app/lib/actions/statuses";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { MCPActionValidationRequest, ModelId, Result } from "@app/types";
import { removeNulls } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMCPActionResource
  extends ReadonlyAttributesType<AgentMCPAction> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMCPActionResource extends BaseResource<AgentMCPAction> {
  static model: ModelStaticWorkspaceAware<AgentMCPAction> = AgentMCPAction;

  constructor(
    model: ModelStaticWorkspaceAware<AgentMCPAction>,
    blob: Attributes<AgentMCPAction>,
    // TODO(DURABLE-AGENTS, 2025-08-21): consider using the resource instead of the model.
    readonly stepContent: NonAttribute<AgentStepContentModel>
  ) {
    super(model, blob);
  }

  private static async baseFetch(
    auth: Authenticator,
    { where, limit, order }: ResourceFindOptions<AgentMCPAction> = {}
  ) {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const actions = await this.model.findAll({
      where: {
        ...where,
        workspaceId,
      },
      limit,
      order,
    });

    const stepContents = await AgentStepContentModel.findAll({
      where: {
        id: {
          [Op.in]: actions.map((a) => a.stepContentId),
        },
        workspaceId,
      },
    });

    const stepContentsMap = new Map(stepContents.map((s) => [s.id, s]));

    return actions.map((a) => {
      const stepContent = stepContentsMap.get(a.stepContentId);

      // Each action must have a step content.
      assert(stepContent, "Step content not found.");
      return new this(this.model, a.get(), stepContent);
    });
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
        status: "blocked_pending_validation",
      },
      order: [["createdAt", "ASC"]],
    });

    const pendingValidations: MCPActionValidationRequest[] = [];

    // We get the latest version here, it may show a different name than the one used when the
    // action was created, taking this shortcut for the sake of simplicity.
    const agentConfigurations = await getAgentConfigurations(auth, {
      agentIds: [
        ...new Set(
          removeNulls(
            pendingActions.map((a) => a.agentMessage?.agentConfigurationId)
          )
        ),
      ],
      variant: "extra_light",
    });

    for (const action of pendingActions) {
      const agentMessage = action.agentMessage;
      assert(agentMessage?.message, "No message for agent message.");
      const agentConfiguration = agentConfigurations.find(
        (a) => a.sId === agentMessage.agentConfigurationId
      );
      assert(agentConfiguration, "Agent not found.");

      pendingValidations.push({
        messageId: agentMessage.message.sId,
        conversationId,
        actionId: this.modelIdToSId({
          id: action.id,
          workspaceId: owner.id,
        }),
        inputs: action.augmentedInputs,
        stake: action.toolConfiguration.permission,
        metadata: {
          toolName: action.toolConfiguration.originalName,
          mcpServerName: action.toolConfiguration.mcpServerName,
          agentName: agentConfiguration.name,
          icon: action.toolConfiguration.icon,
        },
      });
    }

    return pendingValidations;
  }

  static async listBlockedActionsForAgentMessage(
    auth: Authenticator,
    { agentMessageId }: { agentMessageId: ModelId }
  ): Promise<AgentMCPActionResource[]> {
    const actions = await this.baseFetch(auth, {
      where: {
        agentMessageId,
        status: {
          [Op.in]: TOOL_EXECUTION_BLOCKED_STATUSES,
        },
      },
    });

    if (actions.length === 0) {
      return [];
    }

    // Assert all blocked actions have the same step.
    const steps = actions.map((a) => a.stepContent.step);
    const uniqueSteps = [...new Set(steps)];
    assert(
      uniqueSteps.length === 1,
      `All blocked actions must be from the same step, got ${steps.join(", ")}`
    );

    return actions;
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

  get sId(): string {
    return AgentMCPActionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  private static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("mcp_action", {
      id,
      workspaceId,
    });
  }
}
