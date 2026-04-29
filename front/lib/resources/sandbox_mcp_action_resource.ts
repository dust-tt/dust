import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import {
  getInternalMCPServerNameFromSId,
  type InternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { TOOL_EXECUTION_BLOCKED_STATUSES } from "@app/lib/actions/statuses";
import { getApprovalArgsLabel } from "@app/lib/actions/tool_approval_labels";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfigurationsWithVersion } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { SandboxMCPActionModel } from "@app/lib/models/agent/actions/sandbox_mcp_action";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
// biome-ignore lint/plugin/noBulkLodash: existing usage
import _ from "lodash";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxMCPActionResource
  extends ReadonlyAttributesType<SandboxMCPActionModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxMCPActionResource extends BaseResource<SandboxMCPActionModel> {
  static model: ModelStaticWorkspaceAware<SandboxMCPActionModel> =
    SandboxMCPActionModel;

  readonly internalMCPServerName: InternalMCPServerNameType | null;

  constructor(
    model: ModelStaticWorkspaceAware<SandboxMCPActionModel>,
    blob: Attributes<SandboxMCPActionModel>
  ) {
    super(model, blob);
    this.internalMCPServerName = getInternalMCPServerNameFromSId(
      blob.toolConfiguration.toolServerId
    );
  }

  get sId(): string {
    return SandboxMCPActionResource.modelIdToSId({
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
    return makeSId("sandbox_mcp_action", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<SandboxMCPActionModel>, "workspaceId">
  ): Promise<SandboxMCPActionResource> {
    const workspace = auth.getNonNullableWorkspace();
    const action = await SandboxMCPActionModel.create({
      ...blob,
      workspaceId: workspace.id,
    });
    return new this(this.model, action.get());
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<SandboxMCPActionResource | null> {
    const modelId = getResourceIdFromSId(sId);
    if (!modelId) {
      return null;
    }
    const action = await SandboxMCPActionModel.findOne({
      where: {
        id: modelId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    return action ? new this(this.model, action.get()) : null;
  }

  async updateStatus(
    status: ToolExecutionStatus
  ): Promise<[affectedCount: number]> {
    return this.update({ status });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number | undefined, Error>> {
    await SandboxMCPActionModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    return new Ok(this.id);
  }

  /**
   * The tool's original name as stored in toolConfiguration.
   * Analogous to AgentMCPActionResource.functionCallName but sandbox actions
   * don't have a stepContent with a function call value.
   */
  get functionCallName(): string {
    return this.toolConfiguration.originalName;
  }

  /**
   * Returns blocked sandbox actions for a conversation's latest agent messages,
   * formatted as BlockedToolExecution[] so they can be merged with regular
   * blocked actions from AgentMCPActionResource.
   *
   * Sandbox actions only produce "blocked_validation_required" status — they
   * don't do OAuth, file auth, user questions, or child actions.
   */
  static async listBlockedForConversation(
    auth: Authenticator,
    conversation: ConversationResource
  ): Promise<BlockedToolExecution[]> {
    const latestAgentMessages =
      await conversation.getLatestAgentMessageIdByRank(auth);
    const latestAgentMessageIds = latestAgentMessages.map(
      (m) => m.agentMessageId
    );

    return this.listBlockedFormatted(auth, {
      agentMessageIds: latestAgentMessageIds,
      conversationSId: conversation.sId,
      conversationModelId: conversation.id,
    });
  }

  /**
   * Returns blocked sandbox actions for a single agent message. Used to
   * resolve children of a bubbled-up parent bash action whose status is
   * `blocked_child_action_input_required`.
   */
  static async listBlockedForAgentMessage(
    auth: Authenticator,
    {
      agentMessageId,
      conversationSId,
      conversationModelId,
    }: {
      agentMessageId: ModelId;
      conversationSId: string;
      conversationModelId: ModelId;
    }
  ): Promise<BlockedToolExecution[]> {
    return this.listBlockedFormatted(auth, {
      agentMessageIds: [agentMessageId],
      conversationSId,
      conversationModelId,
    });
  }

  private static async listBlockedFormatted(
    auth: Authenticator,
    {
      agentMessageIds,
      conversationSId,
      conversationModelId,
    }: {
      agentMessageIds: ModelId[];
      conversationSId: string;
      conversationModelId: ModelId;
    }
  ): Promise<BlockedToolExecution[]> {
    const owner = auth.getNonNullableWorkspace();

    if (agentMessageIds.length === 0) {
      return [];
    }

    const blockedActions = await SandboxMCPActionModel.findAll({
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          attributes: [
            "id",
            "agentConfigurationId",
            "agentConfigurationVersion",
          ],
          include: [
            {
              model: MessageModel,
              as: "message",
              required: true,
              attributes: ["id", "sId", "parentId"],
            },
          ],
        },
      ],
      where: {
        workspaceId: owner.id,
        agentMessageId: { [Op.in]: agentMessageIds },
        status: { [Op.in]: TOOL_EXECUTION_BLOCKED_STATUSES },
      },
      order: [["createdAt", "ASC"]],
    });

    if (blockedActions.length === 0) {
      return [];
    }

    // Look up parent user messages for userId.
    const parentUserMessageIds = removeNulls(
      blockedActions.map((a) => a.agentMessage!.message!.parentId)
    );

    const parentUserMessages = await MessageModel.findAll({
      where: {
        workspaceId: owner.id,
        conversationId: conversationModelId,
        id: { [Op.in]: parentUserMessageIds },
      },
      attributes: ["id"],
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: true,
          attributes: ["id"],
          include: [
            {
              model: UserModel,
              as: "user",
              attributes: ["sId"],
            },
          ],
        },
      ],
    });

    const parentUserMessageById = _.keyBy(parentUserMessages, "id");

    const agentConfigVersionPairs = removeNulls(
      blockedActions.map((a) => {
        const agentMessage = a.agentMessage;
        if (!agentMessage) {
          return null;
        }
        return {
          agentId: agentMessage.agentConfigurationId,
          agentVersion: agentMessage.agentConfigurationVersion,
        };
      })
    );

    const agentConfigurations = await getAgentConfigurationsWithVersion(
      auth,
      agentConfigVersionPairs,
      { variant: "extra_light" }
    );

    const agentConfigurationMap = new Map(
      agentConfigurations.map((a) => [`${a.sId}:${a.version}`, a])
    );

    const result: BlockedToolExecution[] = [];

    for (const action of blockedActions) {
      const agentMessage = action.agentMessage;
      assert(agentMessage?.message, "No message for agent message.");

      const agentConfiguration = agentConfigurationMap.get(
        `${agentMessage.agentConfigurationId}:${agentMessage.agentConfigurationVersion}`
      );
      if (!agentConfiguration) {
        logger.warn(
          { actionId: action.id, workspaceId: owner.id },
          "Agent configuration not found for sandbox blocked action"
        );
        continue;
      }

      // Sandbox actions only produce "blocked_validation_required".
      if (action.status !== "blocked_validation_required") {
        continue;
      }

      const parentUserMessage =
        parentUserMessageById[agentMessage.message.parentId!];
      assert(parentUserMessage?.userMessage, "Parent user message not found.");

      result.push({
        messageId: agentMessage.message.sId,
        userId: parentUserMessage.userMessage?.user?.sId,
        conversationId: conversationSId,
        actionId: this.modelIdToSId({
          id: action.id,
          workspaceId: owner.id,
        }),
        configurationId: isLightServerSideMCPToolConfiguration(
          action.toolConfiguration
        )
          ? action.toolConfiguration.sId
          : agentConfiguration.sId,
        created: action.createdAt.getTime(),
        inputs: action.augmentedInputs,
        stake: action.toolConfiguration.permission,
        metadata: {
          toolName: action.toolConfiguration.originalName,
          mcpServerName: action.toolConfiguration.mcpServerName,
          agentName: agentConfiguration.name,
          icon: action.toolConfiguration.icon,
        },
        argumentsRequiringApproval:
          action.toolConfiguration.argumentsRequiringApproval,
        approvalArgsLabel: await getApprovalArgsLabel({
          auth,
          internalMCPServerName: action.toolConfiguration.toolServerId
            ? getInternalMCPServerNameFromSId(
                action.toolConfiguration.toolServerId
              )
            : null,
          toolName: action.toolConfiguration.originalName,
          agentName: agentConfiguration.name,
          inputs: action.augmentedInputs,
          argumentsRequiringApproval:
            action.toolConfiguration.argumentsRequiringApproval ?? [],
        }),
        status: "blocked_validation_required",
        authorizationInfo: null,
      });
    }

    return result;
  }
}
