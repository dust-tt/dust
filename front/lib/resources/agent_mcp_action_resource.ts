import assert from "assert";
import _ from "lodash";
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
import { isToolGeneratedFile } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { hideFileFromActionOutput } from "@app/lib/actions/mcp_utils";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import {
  isToolExecutionStatusBlocked,
  TOOL_EXECUTION_BLOCKED_STATUSES,
} from "@app/lib/actions/statuses";
import type { StepContext } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import logger from "@app/logger/logger";
import type { ModelId, Result } from "@app/types";
import { Err, isString, normalizeError, Ok, removeNulls } from "@app/types";
import type {
  AgentMCPActionType,
  AgentMCPActionWithOutputType,
} from "@app/types/actions";
import type { FunctionCallContentType } from "@app/types/assistant/agent_message_content";

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
    readonly stepContent: NonAttribute<
      AgentStepContentResource & { value: FunctionCallContentType }
    >,
    readonly metadata: {
      internalMCPServerName: InternalMCPServerNameType | null;
      mcpServerId: string;
    }
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

    const stepContents = await AgentStepContentResource.fetchByModelIds(
      auth,
      actions.map((a) => a.stepContentId)
    );

    const stepContentsMap = new Map(stepContents.map((s) => [s.id, s]));

    return actions.map((a) => {
      const stepContent = stepContentsMap.get(a.stepContentId);

      // Each action must have a function call step content.
      assert(stepContent, "Step content not found.");
      assert(
        stepContent.isFunctionCallContent(),
        "Step content is not a function call."
      );

      const internalMCPServerName = a.toolConfiguration.toolServerId
        ? getInternalMCPServerNameFromSId(a.toolConfiguration.toolServerId)
        : null;

      return new this(this.model, a.get(), stepContent, {
        internalMCPServerName,
        mcpServerId: a.toolConfiguration.toolServerId,
      });
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

    const stepContent = await AgentStepContentResource.fetchByModelIdWithAuth(
      auth,
      action.stepContentId
    );
    assert(stepContent, "Step content not found.");
    assert(
      stepContent.isFunctionCallContent(),
      "Step content is not a function call."
    );

    return new this(this.model, action.get(), stepContent, {
      internalMCPServerName,
      mcpServerId: blob.toolConfiguration.toolServerId,
    });
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

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<AgentMCPActionResource | null> {
    const modelId = getResourceIdFromSId(sId);
    if (!modelId) {
      return null;
    }

    const [action] = await AgentMCPActionResource.fetchByModelIds(auth, [
      modelId,
    ]);

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

    const latestAgentMessages =
      await conversation.getLatestAgentMessageIdByRank(auth);

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

      // Ignore actions that are not the latest version of the agent message.
      if (
        !latestAgentMessages.some((m) => m.agentMessageId === agentMessage.id)
      ) {
        continue;
      }

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

      const authorizationInfo =
        mcpServerView?.toJSON().server.authorization ?? null;

      const mcpServerId = mcpServerView?.mcpServerId;
      const mcpServerDisplayName = mcpServerView
        ? getMcpServerViewDisplayName(mcpServerView.toJSON())
        : undefined;

      const baseActionParams: Omit<
        BlockedToolExecution,
        "status" | "authorizationInfo"
      > = {
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
      };

      if (action.status === "blocked_authentication_required") {
        if (!mcpServerId || !mcpServerDisplayName || !authorizationInfo) {
          logger.warn(
            {
              actionId: action.id,
              conversationId,
              messageId: agentMessage.message.sId,
              workspaceId: owner.id,
            },
            `MCP server view or authorization info not found for blocked action ${action.id}`
          );

          continue;
        }

        blockedActionsList.push({
          ...baseActionParams,
          status: action.status,
          authorizationInfo,
          metadata: {
            ...baseActionParams.metadata,
            mcpServerId,
            mcpServerDisplayName,
          },
        });
      } else if (action.status === "blocked_child_action_input_required") {
        const conversationId = action.stepContext.resumeState?.conversationId;
        const childBlockedActionsList = isString(conversationId)
          ? await this.listBlockedActionsForConversation(auth, conversationId)
          : [];

        blockedActionsList.push({
          ...baseActionParams,
          status: action.status,
          resumeState: action.stepContext.resumeState,
          childBlockedActionsList,
          metadata: {
            ...baseActionParams.metadata,
            mcpServerId,
            mcpServerDisplayName,
          },
          authorizationInfo: null,
        });
      } else {
        blockedActionsList.push({
          ...baseActionParams,
          status: action.status,
          metadata: {
            ...baseActionParams.metadata,
            mcpServerId,
            mcpServerDisplayName,
          },
          authorizationInfo: null,
        });
      }
    }

    return blockedActionsList;
  }

  static async fetchByStepContents(
    auth: Authenticator,
    {
      stepContents,
      latestVersionsOnly = false,
    }: {
      stepContents: AgentStepContentResource[];
      latestVersionsOnly?: boolean;
    }
  ): Promise<AgentMCPActionResource[]> {
    if (stepContents.length === 0) {
      return [];
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    // Not using the baseFetch because we already have the step contents.
    let actions = await AgentMCPActionModel.findAll({
      where: {
        workspaceId,
        stepContentId: {
          [Op.in]: stepContents.map((content) => content.id),
        },
      },
    });

    if (latestVersionsOnly) {
      const actionsByStepContentId = _.groupBy(actions, (action) =>
        action.stepContentId.toString()
      );
      actions = removeNulls(
        Object.values(actionsByStepContentId).map(
          (actionsForContent) => _.maxBy(actionsForContent, "version") ?? null
        )
      );
    }

    const stepContentsMap = new Map(stepContents.map((s) => [s.id, s]));

    return actions.map((a) => {
      const stepContent = stepContentsMap.get(a.stepContentId);

      // Each action must have a function call step content.
      assert(stepContent, "Step content not found.");
      assert(
        stepContent.isFunctionCallContent(),
        "Step content is not a function call."
      );

      const internalMCPServerName = a.toolConfiguration.toolServerId
        ? getInternalMCPServerNameFromSId(a.toolConfiguration.toolServerId)
        : null;

      return new this(this.model, a.get(), stepContent, {
        internalMCPServerName,
        mcpServerId: a.toolConfiguration.toolServerId,
      });
    });
  }

  static async listByAgentMessageIds(
    auth: Authenticator,
    agentMessageIds: ModelId[]
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

  static async enrichActionsWithOutputItems(
    auth: Authenticator,
    actions: AgentMCPActionResource[]
  ): Promise<AgentMCPActionWithOutputType[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const outputItemsByActionId = _.groupBy(
      await AgentMCPActionOutputItem.findAll({
        where: {
          workspaceId,
          agentMCPActionId: {
            [Op.in]: actions.map((a) => a.id),
          },
        },
      }),
      "agentMCPActionId"
    );

    const fileIds = removeNulls(
      Object.values(outputItemsByActionId).flatMap((o) =>
        o.map((o) => o.fileId)
      )
    );

    const fileById = _.keyBy(
      // Using the model instead of the resource since we're mutating outputItems.
      // Not super clean but everything happens in this one function and faster to write.
      await FileModel.findAll({
        where: {
          workspaceId,
          id: {
            [Op.in]: fileIds,
          },
        },
      }),
      "id"
    );

    for (const outputItems of Object.values(outputItemsByActionId)) {
      for (const item of outputItems) {
        if (item.fileId) {
          item.file = fileById[item.fileId.toString()];
        }
      }
    }

    return actions.map((action) => {
      const outputItems = outputItemsByActionId[action.id.toString()] ?? [];
      return {
        ...action.toJSON(),
        output: removeNulls(outputItems.map(hideFileFromActionOutput)),
        generatedFiles: removeNulls(
          outputItems.map((o) => {
            if (!o.file) {
              return null;
            }

            const file = o.file;

            const hidden =
              o.content.type === "resource" &&
              isToolGeneratedFile(o.content) &&
              o.content.resource.hidden === true;

            return {
              fileId: FileResource.modelIdToSId({
                id: file.id,
                workspaceId: file.workspaceId,
              }),
              contentType: file.contentType,
              title: file.fileName,
              snippet: file.snippet,
              ...(hidden ? { hidden: true } : {}),
            };
          })
        ),
      };
    });
  }

  toJSON(): AgentMCPActionType {
    assert(
      this.stepContent.value.type === "function_call",
      "Action linked to a non-function call step content."
    );

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      agentMessageId: this.agentMessageId,
      citationsAllocated: this.citationsAllocated,
      functionCallName: this.functionCallName,
      functionCallId: this.stepContent.value.value.id,
      internalMCPServerName: this.metadata.internalMCPServerName,
      mcpServerId: this.metadata.mcpServerId,
      params: this.augmentedInputs,
      status: this.status,
      step: this.stepContent.step,
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
      agentMessageIds: ModelId[];
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

  get functionCalldId(): string {
    return this.stepContent.value.value.id;
  }

  get functionCallName(): string {
    return this.stepContent.value.value.name;
  }
}
