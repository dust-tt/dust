import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  NonAttribute,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import {
  isToolExecutionStatusBlocked,
  TOOL_EXECUTION_BLOCKED_STATUSES,
} from "@app/lib/actions/statuses";
import type { StepContext } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionModel } from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import { removeNulls } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { AgentMCPActionType } from "@app/types/actions";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMCPActionResource
  extends ReadonlyAttributesType<AgentMCPActionModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMCPActionResource extends BaseResource<AgentMCPActionModel> {
  static model: ModelStaticWorkspaceAware<AgentMCPActionModel> =
    AgentMCPActionModel;

  constructor(
    model: ModelStaticWorkspaceAware<AgentMCPActionModel>,
    blob: Attributes<AgentMCPActionModel>,
    // TODO(DURABLE-AGENTS, 2025-08-21): consider using the resource instead of the model.
    readonly stepContent: NonAttribute<AgentStepContentModel>,
    readonly internalMCPServerName: InternalMCPServerNameType | null
  ) {
    super(model, blob);
  }

  private static async baseFetch(
    auth: Authenticator,
    { where, limit, order }: ResourceFindOptions<AgentMCPActionModel>,
    transaction?: Transaction
  ): Promise<AgentMCPActionResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const actions = await this.model.findAll({
      where: {
        ...where,
        workspaceId,
      },
      limit,
      order,
      transaction,
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
      const internalMCPServerName = getInternalMCPServerNameFromSId(
        a.toolConfiguration.toolServerId
      );

      return new this(this.model, a.get(), stepContent, internalMCPServerName);
    });
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<AgentMCPActionModel>, "workspaceId">,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<AgentMCPActionResource> {
    const workspace = auth.getNonNullableWorkspace();
    const internalMCPServerName = getInternalMCPServerNameFromSId(
      blob.toolConfiguration.toolServerId
    );

    const action = await AgentMCPActionModel.create(
      {
        ...blob,
        workspaceId: workspace.id,
      },
      { transaction }
    );

    const stepContent = await AgentStepContentModel.findOne({
      where: {
        id: action.stepContentId,
        workspaceId: workspace.id,
      },
      transaction,
    });
    assert(stepContent, "Step content not found.");

    return new this(
      this.model,
      action.get(),
      stepContent,
      internalMCPServerName
    );
  }

  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId,
    transaction?: Transaction
  ): Promise<AgentMCPActionResource | null> {
    const [action] = await this.baseFetch(
      auth,
      {
        where: { id },
      },
      transaction
    );
    return action;
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[]
  ): Promise<AgentMCPActionResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    });
  }

  static async listBlockedActionsForConversation(
    auth: Authenticator,
    conversationId: string
  ): Promise<BlockedToolExecution[]> {
    const owner = auth.getNonNullableWorkspace();

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversation) {
      return [];
    }

    const blockedActions = await AgentMCPActionModel.findAll({
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
        status: {
          [Op.in]: TOOL_EXECUTION_BLOCKED_STATUSES,
        },
      },
      order: [["createdAt", "ASC"]],
    });

    const blockedActionsList: BlockedToolExecution[] = [];

    // We get the latest version here, it may show a different name than the one used when the
    // action was created, taking this shortcut for the sake of simplicity.
    const agentConfigurations = await getAgentConfigurations(auth, {
      agentIds: [
        ...new Set(
          removeNulls(
            blockedActions.map((a) => a.agentMessage?.agentConfigurationId)
          )
        ),
      ],
      variant: "extra_light",
    });

    const mcpServerViewIds = [
      ...new Set(
        removeNulls(
          blockedActions.map(({ toolConfiguration }) => {
            return isLightServerSideMCPToolConfiguration(toolConfiguration)
              ? toolConfiguration.mcpServerViewId
              : null;
          })
        )
      ),
    ];

    const mcpServerViews = await MCPServerViewResource.fetchByIds(
      auth,
      mcpServerViewIds
    );

    const mcpServerViewMap = new Map(
      mcpServerViews.map((view) => [view.sId, view])
    );

    for (const action of blockedActions) {
      const agentMessage = action.agentMessage;
      assert(agentMessage?.message, "No message for agent message.");
      const agentConfiguration = agentConfigurations.find(
        (a) => a.sId === agentMessage.agentConfigurationId
      );
      assert(agentConfiguration, "Agent not found.");

      // We just fetched on the status being blocked, we just don't get it typed properly.
      assert(
        isToolExecutionStatusBlocked(action.status),
        "Action is not blocked."
      );
      const mcpServerView = isLightServerSideMCPToolConfiguration(
        action.toolConfiguration
      )
        ? mcpServerViewMap.get(action.toolConfiguration.mcpServerViewId)
        : null;

      blockedActionsList.push({
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
          mcpServerId: mcpServerView?.mcpServerId,
          mcpServerDisplayName: mcpServerView
            ? getMcpServerViewDisplayName(mcpServerView.toJSON())
            : undefined,
        },
        status: action.status,
        authorizationInfo: mcpServerView?.toJSON().server.authorization ?? null,
      });
    }

    return blockedActionsList;
  }

  static async listByAgentMessageIds(
    auth: Authenticator,
    agentMessageIds: Array<ModelId>
  ): Promise<AgentMCPActionResource[]> {
    return this.baseFetch(auth, {
      where: { agentMessageId: { [Op.in]: agentMessageIds } },
    });
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

  toJSON(): AgentMCPActionType {
    return {
      agentMessageId: this.agentMessageId,
      citationsAllocated: this.citationsAllocated,
      id: this.id,
      internalMCPServerName: this.internalMCPServerName,
      mcpServerConfigurationId: this.mcpServerConfigurationId,
      params: this.augmentedInputs,
      status: this.status,
      stepContentId: this.stepContentId,
      stepContext: this.stepContext,
      toolConfiguration: this.toolConfiguration,
      version: this.version,
      workspaceId: this.workspaceId,
    };
  }

  async updateStatus(
    status: ToolExecutionStatus
  ): Promise<[affectedCount: number]> {
    return this.update({
      status,
    });
  }

  async updateStepContext(
    stepContext: StepContext
  ): Promise<[affectedCount: number]> {
    return this.update({
      stepContext,
    });
  }

  static async deleteByAgentMessageId(
    auth: Authenticator,
    params: {
      agentMessageIds: Array<ModelId>;
      transaction?: Transaction;
    }
  ): Promise<Result<undefined, Error>> {
    try {
      const workspaceId = auth.getNonNullableWorkspace().id;
      await AgentMCPActionModel.destroy({
        where: {
          agentMessageId: { [Op.in]: params.agentMessageIds },
          workspaceId,
        },
        transaction: params.transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await AgentMCPActionModel.destroy({
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

  static modelIdToSId({
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
