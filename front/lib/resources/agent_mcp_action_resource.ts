import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import { isToolGeneratedFilePath } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { hideFileFromActionOutput } from "@app/lib/actions/mcp_utils";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import {
  isToolExecutionStatusBlocked,
  TOOL_EXECUTION_BLOCKED_STATUSES,
  TOOL_EXECUTION_FINAL_STATUSES,
} from "@app/lib/actions/statuses";
import { getApprovalArgsLabel } from "@app/lib/actions/tool_approval_labels";
import {
  getToolDisplayLabels,
  getToolNameFromFunctionCallName,
} from "@app/lib/actions/tool_display_labels";
import type {
  ActionGeneratedDBFileType,
  StepContext,
  ToolOutputItemType,
} from "@app/lib/actions/types";
import {
  isFileAuthorizationInfo,
  isSandboxChildActionInfo,
  isUserQuestionResumeState,
} from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { AGENT_DELEGATION_SERVER_NAME } from "@app/lib/api/actions/servers/agent_delegation/metadata";
import { RUN_AGENT_SERVER_NAME } from "@app/lib/api/actions/servers/run_agent/metadata";
import { isRunAgentResumeState } from "@app/lib/api/actions/servers/run_agent/types";
import { getCitationsFromToolOutput } from "@app/lib/api/assistant/citations";
import { getAgentConfigurationsWithVersion } from "@app/lib/api/assistant/configuration/agent";
import type { ToolDisplayLabels } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import {
  batchFetchContentsFromGcs,
  batchWriteContentsToGcs,
  deleteActionOutputsFromGcs,
  warmGcsContentCache,
} from "@app/lib/resources/agent_mcp_action/output_storage";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import type {
  AgentMCPActionType,
  AgentMCPActionWithOutputType,
} from "@app/types/actions";
import type { AttachmentCreator } from "@app/types/api/assistant/conversation/attachments";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentFunctionCallContentType } from "@app/types/assistant/agent_message_content";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { UNRESUMABLE_AGENT_MESSAGE_STATUSES } from "@app/types/assistant/conversation";
import { getFileDisplayName } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import chunk from "lodash/chunk";
import groupBy from "lodash/groupBy";
import keyBy from "lodash/keyBy";
import type {
  Attributes,
  CreationAttributes,
  NonAttribute,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";
import { AgentStepContentModel } from "../models/agent/agent_step_content";

type ConversationGeneratedFileType = ActionGeneratedDBFileType & {
  creator: AttachmentCreator | null;
};

// Batch size for fetching output items to avoid loading too many large rows at once.
const OUTPUT_ITEMS_BATCH_SIZE = 32;

const FETCH_OUTPUT_ITEMS_CONCURRENCY = 2;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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
      AgentStepContentResource & { value: AgentFunctionCallContentType }
    >,
    readonly metadata: {
      internalMCPServerName: InternalMCPServerNameType | null;
      // Can be undefined for old actions created before toolServerId was added to the toolConfiguration JSONB.
      mcpServerId: string | undefined;
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

    if (actions.length === 0) {
      return [];
    }

    const agentStepContentToolExecutions =
      await AgentStepContentToolExecutionModel.findAll({
        where: {
          workspaceId,
          agentMCPActionId: { [Op.in]: actions.map((a) => a.id) },
        },
        include: [
          {
            model: AgentStepContentModel,
            as: "stepContent",
            required: true,
          },
        ],
        transaction,
      });

    const stepContentByActionId = new Map<ModelId, AgentStepContentResource>();
    for (const toolExecution of agentStepContentToolExecutions) {
      const stepContentModel = toolExecution.stepContent;

      stepContentByActionId.set(
        toolExecution.agentMCPActionId,
        new AgentStepContentResource(
          AgentStepContentResource.model,
          stepContentModel.get()
        )
      );
    }

    return actions.map((a) => {
      const stepContent = stepContentByActionId.get(a.id);

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
    {
      conversation,
      stepContent,
    }: {
      conversation: ConversationWithoutContentType | ConversationResource;
      stepContent: AgentStepContentResource;
    },
    blob: Omit<CreationAttributes<AgentMCPActionModel>, "workspaceId">,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<AgentMCPActionResource> {
    const workspace = auth.getNonNullableWorkspace();
    const internalMCPServerName = getInternalMCPServerNameFromSId(
      blob.toolConfiguration.toolServerId
    );

    const action = await withTransaction(async (t) => {
      const agentMCPAction = await AgentMCPActionModel.create(
        {
          ...blob,
          workspaceId: workspace.id,
        },
        { transaction: t }
      );

      await AgentStepContentToolExecutionModel.create(
        {
          workspaceId: workspace.id,
          agentMessageId: blob.agentMessageId,
          conversationId: conversation.id,
          agentMCPActionId: agentMCPAction.id,
          stepContentId: stepContent.id,
        },
        { transaction: t }
      );

      return agentMCPAction;
    }, transaction);

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
    conversation: ConversationResource
  ): Promise<AgentLoopBlockedToolExecution[]> {
    const owner = auth.getNonNullableWorkspace();

    const latestAgentMessages =
      await conversation.getLatestAgentMessageIdByRank(auth);

    const latestAgentMessageIds = latestAgentMessages.map(
      (m) => m.agentMessageId
    );

    if (latestAgentMessageIds.length === 0) {
      return [];
    }

    // Scope by agentMessageId to fully use the (workspaceId, agentMessageId, status) index,
    // avoiding a broad scan + join through messages to filter by conversationId.
    const blockedActionRows = await AgentMCPActionModel.findAll({
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          attributes: [
            "id",
            "agentConfigurationId",
            "agentConfigurationVersion",
            "status",
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
        agentMessageId: { [Op.in]: latestAgentMessageIds },
        status: {
          [Op.in]: TOOL_EXECUTION_BLOCKED_STATUSES,
        },
      },
      order: [["createdAt", "ASC"]],
    });

    // A blocked action is only actionable while its agent message can still resume: exclude
    // actions left behind by messages that reached a non-resumable terminal status before their
    // blocked tools got resolved. Filtered application-side: agent_messages has no index on
    // status, and the rows are already narrowed to the conversation's latest agent messages.
    const blockedActions = blockedActionRows.filter(
      (a) =>
        !UNRESUMABLE_AGENT_MESSAGE_STATUSES.includes(a.agentMessage!.status)
    );

    const parentUserMessageIds = removeNulls(
      blockedActions.map((a) => a.agentMessage!.message!.parentId)
    );

    const parentUserMessages = await MessageModel.findAll({
      where: {
        workspaceId: owner.id,
        conversationId: conversation.id,
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

    const parentUserMessageById = keyBy(parentUserMessages, "id");

    const blockedActionsList: AgentLoopBlockedToolExecution[] = [];

    // Fetch agent configurations with their specific versions from the actions.
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

    const [agentConfigurations, mcpServerViews] = await Promise.all([
      getAgentConfigurationsWithVersion(auth, agentConfigVersionPairs, {
        variant: "extra_light",
      }),
      MCPServerViewResource.fetchByIds(auth, mcpServerViewIds, {
        includeHeavyAttributes: ["authorization"],
      }),
    ]);

    const agentConfigurationMap = new Map(
      agentConfigurations.map((a) => [`${a.sId}:${a.version}`, a])
    );

    const mcpServerViewMap = new Map(
      mcpServerViews.map((view) => [view.sId, view])
    );

    for (const action of blockedActions) {
      const agentMessage = action.agentMessage;
      assert(agentMessage?.message, "No message for agent message.");

      const agentConfiguration = agentConfigurationMap.get(
        `${agentMessage.agentConfigurationId}:${agentMessage.agentConfigurationVersion}`
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
      const editableArguments = isLightServerSideMCPToolConfiguration(
        action.toolConfiguration
      )
        ? action.toolConfiguration.editableArguments
        : undefined;

      const authorizationInfo = mcpServerView?.getAuthorization() ?? null;

      const mcpServerId = mcpServerView?.mcpServerId;
      const mcpServerDisplayName = mcpServerView?.getDisplayName();
      const icon =
        mcpServerView?.getServerDisplayMetadata().icon ??
        action.toolConfiguration.icon;
      const internalMCPServerName = action.toolConfiguration.toolServerId
        ? getInternalMCPServerNameFromSId(action.toolConfiguration.toolServerId)
        : null;

      const parentUserMessage =
        parentUserMessageById[agentMessage.message.parentId!];

      assert(parentUserMessage.userMessage, "Parent user message not found.");

      const displayLabels =
        getToolDisplayLabels({
          internalMCPServerName,
          mcpServerName: action.toolConfiguration.mcpServerName,
          toolName: action.toolConfiguration.originalName,
          inputs: {
            ...action.augmentedInputs,
            ...(action.userEditedInputs ?? {}),
          },
        }) ?? action.toolConfiguration.displayLabels;

      const baseActionParams: Omit<
        AgentLoopBlockedToolExecution,
        "status" | "authorizationInfo"
      > = {
        // Compute approval labels from persisted configuration + stored inputs.
        // This keeps resumed conversations consistent with streamed events.
        messageId: agentMessage.message.sId,
        userId: parentUserMessage.userMessage?.user?.sId,
        conversationId: conversation.sId,
        actionId: this.modelIdToSId({
          id: action.id,
          workspaceId: owner.id,
        }),
        configurationId: action.toolConfiguration.sId,
        created: action.createdAt.getTime(),
        inputs: action.augmentedInputs,
        stake: action.toolConfiguration.permission,
        metadata: {
          toolName: action.toolConfiguration.originalName,
          mcpServerName: action.toolConfiguration.mcpServerName,
          displayLabel: displayLabels?.done,
          agentName: agentConfiguration.name,
          icon,
        },
        argumentsRequiringApproval:
          action.toolConfiguration.argumentsRequiringApproval,
        approvalArgsLabel: await getApprovalArgsLabel({
          auth,
          internalMCPServerName,
          toolName: action.toolConfiguration.originalName,
          agentName: agentConfiguration.name,
          inputs: action.augmentedInputs,
          argumentsRequiringApproval:
            action.toolConfiguration.argumentsRequiringApproval ?? [],
        }),
      };

      if (action.status === "blocked_authentication_required") {
        if (!mcpServerId || !mcpServerDisplayName || !authorizationInfo) {
          logger.warn(
            {
              actionId: action.id,
              conversationId: conversation.sId,
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
      } else if (action.status === "blocked_file_authorization_required") {
        // TODO: Implement file authorization info extraction from action context
        // For now, skip as this status won't be reached until tools emit it
        if (!mcpServerId || !mcpServerDisplayName) {
          logger.warn(
            {
              actionId: action.id,
              conversationId: conversation.sId,
              messageId: agentMessage.message.sId,
              workspaceId: owner.id,
            },
            `MCP server view not found for blocked file auth action ${action.id}`
          );
          continue;
        }

        const fileAuthInfo = action.stepContext.fileAuthorizationInfo;

        // Validate file auth info exists and has correct shape - it's stored dynamically in stepContext.
        if (!isFileAuthorizationInfo(fileAuthInfo)) {
          logger.warn(
            {
              actionId: action.id,
              conversationId: conversation.sId,
              messageId: agentMessage.message.sId,
              workspaceId: owner.id,
            },
            `File authorization info not found for blocked action ${action.id}`
          );
          continue;
        }

        blockedActionsList.push({
          ...baseActionParams,
          status: action.status,
          fileAuthorizationInfo: fileAuthInfo,
          metadata: {
            ...baseActionParams.metadata,
            mcpServerId,
            mcpServerDisplayName,
          },
        });
      } else if (action.status === "blocked_user_answer_required") {
        const { resumeState } = action.stepContext;
        if (!isUserQuestionResumeState(resumeState)) {
          logger.warn(
            {
              actionId: action.id,
              conversationId: conversation.sId,
              messageId: agentMessage.message.sId,
              workspaceId: owner.id,
            },
            `User question resume state not found for blocked action ${action.id}`
          );
          continue;
        }

        blockedActionsList.push({
          ...baseActionParams,
          status: action.status,
          question: resumeState.question,
          authorizationInfo: null,
        });
      } else if (action.status === "blocked_child_action_input_required") {
        const conversationId = action.stepContext.resumeState?.conversationId;

        // conversation was not created so we can skip it
        if (!conversationId || !isString(conversationId)) {
          continue;
        }

        const childConversation = await ConversationResource.fetchById(
          auth,
          conversationId
        );

        if (!childConversation) {
          continue;
        }

        const childBlockedActionsList = isString(conversationId)
          ? await this.listBlockedActionsForConversation(
              auth,
              childConversation
            )
          : [];

        blockedActionsList.push({
          ...baseActionParams,
          status: action.status,
          resumeState: action.stepContext.resumeState,
          childBlockedActionsList,
          metadata: {
            ...baseActionParams.metadata,
          },
          authorizationInfo: null,
        });
      } else {
        blockedActionsList.push({
          ...baseActionParams,
          status: action.status,
          editableArguments,
          metadata: {
            ...baseActionParams.metadata,
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
    }: {
      stepContents: AgentStepContentResource[];
    }
  ): Promise<AgentMCPActionResource[]> {
    const functionCallStepContents = stepContents.filter(
      (
        content
      ): content is AgentStepContentResource & {
        value: AgentFunctionCallContentType;
      } => content.isFunctionCallContent()
    );
    if (functionCallStepContents.length === 0) {
      return [];
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    const toolExecutions = await AgentStepContentToolExecutionModel.findAll({
      attributes: ["stepContentId", "agentMCPActionId"],
      where: {
        workspaceId,
        stepContentId: {
          [Op.in]: functionCallStepContents.map((content) => content.id),
        },
      },
    });
    if (toolExecutions.length === 0) {
      return [];
    }

    const actions = await AgentMCPActionModel.findAll({
      where: {
        workspaceId,
        id: {
          [Op.in]: toolExecutions.map(
            (toolExecution) => toolExecution.agentMCPActionId
          ),
        },
      },
    });
    const actionsById = new Map(actions.map((action) => [action.id, action]));
    const stepContentsMap = new Map(
      functionCallStepContents.map((content) => [content.id, content])
    );

    const resources: AgentMCPActionResource[] = [];
    for (const toolExecution of toolExecutions) {
      const action = actionsById.get(toolExecution.agentMCPActionId);
      assert(action, "Action not found.");

      // Sandbox-child actions share their parent's stepContent and must not
      // surface as separate executions in the conversation timeline.
      if (isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)) {
        continue;
      }

      const stepContent = stepContentsMap.get(toolExecution.stepContentId);
      assert(stepContent, "Step content not found.");

      const internalMCPServerName = action.toolConfiguration.toolServerId
        ? getInternalMCPServerNameFromSId(action.toolConfiguration.toolServerId)
        : null;

      resources.push(
        new this(this.model, action.get(), stepContent, {
          internalMCPServerName,
          mcpServerId: action.toolConfiguration.toolServerId,
        })
      );
    }

    return resources;
  }

  static async listModelIdsByAgentMessageIds(
    auth: Authenticator,
    agentMessageIds: ModelId[]
  ): Promise<ModelId[]> {
    if (agentMessageIds.length === 0) {
      return [];
    }

    const actions = await AgentMCPActionModel.findAll({
      attributes: ["id"],
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return actions.map((action) => action.id);
  }

  static async listByAgentMessageIds(
    auth: Authenticator,
    agentMessageIds: ModelId[]
  ): Promise<AgentMCPActionResource[]> {
    return this.baseFetch(auth, {
      where: { agentMessageId: { [Op.in]: agentMessageIds } },
      // Billing policies are applied chronologically. Model ids preserve action
      // creation order and provide a deterministic tie-break for parallel calls.
      order: [["id", "ASC"]],
    });
  }

  static async fetchVisibleByLatestStepContents(
    auth: Authenticator,
    agentMessageModelIds: ModelId[]
  ): Promise<AgentMCPActionResource[]> {
    const stepContents =
      await AgentStepContentResource.fetchLatestFunctionCallsByAgentMessageModelIds(
        auth,
        agentMessageModelIds
      );

    return this.fetchByStepContents(auth, { stepContents });
  }

  /**
   * List FileResource-backed files generated by agent actions in a conversation, without loading
   * the full conversation content. Only the latest version of each agent message rank is
   * considered. Path-only generated files (no `fileId`) are omitted — same filter as
   * `listAttachments`.
   *
   * When `upToRank` is set, only files from agent messages with `rank <= upToRank` are returned.
   */
  static async listGeneratedFilesForConversation(
    auth: Authenticator,
    {
      conversationId,
      upToRank,
    }: {
      conversationId: ModelId;
      upToRank?: number;
    }
  ): Promise<ConversationGeneratedFileType[]> {
    const owner = auth.getNonNullableWorkspace();

    let latestAgentMessages =
      await ConversationResource.getLatestAgentMessageIdByRank(auth, {
        conversationId,
      });

    if (upToRank !== undefined) {
      latestAgentMessages = latestAgentMessages.filter(
        (m) => m.rank <= upToRank
      );
    }

    const latestAgentMessageIds = latestAgentMessages.map(
      (m) => m.agentMessageId
    );

    if (latestAgentMessageIds.length === 0) {
      return [];
    }

    // Scope by agentMessageId to use the (workspaceId, agentMessageId) index.
    const actions = await AgentMCPActionModel.findAll({
      attributes: ["id", "agentMessageId"],
      where: {
        workspaceId: owner.id,
        agentMessageId: { [Op.in]: latestAgentMessageIds },
      },
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
        },
      ],
    });

    if (actions.length === 0) {
      return [];
    }

    const actionIds = actions.map((a) => a.id);
    const outputItems = await AgentMCPActionOutputItemModel.findAll({
      attributes: ["id", "agentMCPActionId", "fileId"],
      where: {
        workspaceId: owner.id,
        agentMCPActionId: { [Op.in]: actionIds },
        fileId: { [Op.ne]: null },
      },
    });

    if (outputItems.length === 0) {
      return [];
    }

    const fileIds = removeNulls(outputItems.map((o) => o.fileId));
    const files = await FileModel.findAll({
      where: {
        workspaceId: owner.id,
        id: { [Op.in]: fileIds },
      },
    });
    const fileById = keyBy(files, "id");

    const agentConfigVersionPairs = removeNulls(
      actions.map((a) => {
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
      {
        variant: "extra_light",
        // Historical agents in a conversation the user can already read.
        dangerouslySkipPermissionFiltering: true,
      }
    );
    const agentConfigurationMap = new Map(
      agentConfigurations.map((a) => [`${a.sId}:${a.version}`, a])
    );

    const actionById = keyBy(actions, "id");
    const agentMessageIdToRank = new Map(
      latestAgentMessages.map((m) => [m.agentMessageId, m.rank])
    );

    const generatedFiles: Array<
      ConversationGeneratedFileType & { rank: number }
    > = [];

    for (const item of outputItems) {
      if (!item.fileId) {
        continue;
      }
      const file = fileById[item.fileId.toString()];
      if (!file) {
        continue;
      }

      const action = actionById[item.agentMCPActionId.toString()];
      const agentMessage = action?.agentMessage;
      if (!agentMessage) {
        continue;
      }

      const agentConfiguration = agentConfigurationMap.get(
        `${agentMessage.agentConfigurationId}:${agentMessage.agentConfigurationVersion}`
      );

      const creator: AttachmentCreator | null = agentConfiguration
        ? {
            type: "agent",
            name: agentConfiguration.name,
            pictureUrl: agentConfiguration.pictureUrl,
          }
        : null;

      generatedFiles.push({
        fileId: FileResource.modelIdToSId({
          id: file.id,
          workspaceId: file.workspaceId,
        }),
        contentType: file.contentType,
        title: getFileDisplayName(file),
        snippet: file.snippet,
        createdAt: file.createdAt.getTime(),
        updatedAt: file.updatedAt.getTime(),
        isInProjectContext: file.useCase === "project_context",
        hidden: file.useCaseMetadata?.hideFromUser ?? false,
        creator,
        rank: agentMessageIdToRank.get(agentMessage.id) ?? 0,
      });
    }

    // Match conversation content order so later ranks overwrite earlier ones when
    // consumers dedupe by fileId (same behavior as walking conversation.content).
    generatedFiles.sort((a, b) => a.rank - b.rank);

    return generatedFiles.map(({ rank: _rank, ...file }) => file);
  }

  /**
   * A message should never have blocked actions from more than one step, and resume paths rely
   * on that to resume the agent loop from a single, unambiguous step. By default this enforces the
   * invariant and throws on a violation, surfacing the bug. `dangerouslyBypassSameStepCheck` (used
   * by the unstick-conversation poke plugin) skips the check so a genuinely stuck conversation can
   * still be finalized.
   */
  static async listBlockedActionsForAgentMessage(
    auth: Authenticator,
    {
      agentMessageId,
      transaction,
      dangerouslyBypassSameStepCheck = false,
    }: {
      agentMessageId: ModelId;
      transaction?: Transaction;
      dangerouslyBypassSameStepCheck?: boolean;
    }
  ): Promise<AgentMCPActionResource[]> {
    const actions = await this.baseFetch(
      auth,
      {
        where: {
          agentMessageId,
          status: {
            [Op.in]: TOOL_EXECUTION_BLOCKED_STATUSES,
          },
        },
      },
      transaction
    );

    if (actions.length === 0) {
      return [];
    }

    if (!dangerouslyBypassSameStepCheck) {
      const steps = actions.map((a) => a.stepContent.step);
      const uniqueSteps = [...new Set(steps)];
      assert(
        uniqueSteps.length === 1,
        `All blocked actions must be from the same step, got ${steps.join(", ")}`
      );
    }

    return actions;
  }

  // Actions the agent message left in a non-final status: still running when a workflow errors
  // (the worker that ran them may have died before finalizing the row), or parked on a user
  // interaction (blocked_*). Callers discriminate on `status`.
  static async listNonFinalActionsForAgentMessage(
    auth: Authenticator,
    { agentMessageModelId }: { agentMessageModelId: ModelId }
  ): Promise<AgentMCPActionResource[]> {
    return this.baseFetch(auth, {
      where: {
        agentMessageId: agentMessageModelId,
        status: {
          [Op.notIn]: TOOL_EXECUTION_FINAL_STATUSES,
        },
      },
    });
  }

  /**
   * Denies all still-blocked actions of an agent message. Must run inside the same
   * transaction as the message's terminal status update so that "message terminal" and
   * "blocked actions denied" commit atomically. Guarded on blocked statuses so a concurrent
   * approval that already transitioned the action is not clobbered. Returns the actions
   * actually denied, with their pre-deny resources.
   *
   * `dangerouslyBypassSameStepCheck` is forwarded to listBlockedActionsForAgentMessage: leave it
   * false to enforce the single-step invariant; the unstick-conversation poke plugin passes true to
   * finalize an anomalous, genuinely stuck conversation instead of throwing.
   */
  static async denyBlockedActionsForAgentMessage(
    auth: Authenticator,
    {
      agentMessageId,
      transaction,
      dangerouslyBypassSameStepCheck = false,
    }: {
      agentMessageId: ModelId;
      transaction: Transaction;
      dangerouslyBypassSameStepCheck?: boolean;
    }
  ): Promise<AgentMCPActionResource[]> {
    const blockedActions = await this.listBlockedActionsForAgentMessage(auth, {
      agentMessageId,
      transaction,
      dangerouslyBypassSameStepCheck,
    });

    if (blockedActions.length === 0) {
      return [];
    }

    const [, affectedRows] = await AgentMCPActionModel.update(
      { status: "denied" },
      {
        where: {
          // Scoping by agentMessageId lets the (workspaceId, agentMessageId, status) index
          // drive the update; the id list keeps it restricted to the rows fetched above.
          agentMessageId,
          id: { [Op.in]: blockedActions.map((a) => a.id) },
          workspaceId: auth.getNonNullableWorkspace().id,
          status: { [Op.in]: TOOL_EXECUTION_BLOCKED_STATUSES },
        },
        returning: true,
        transaction,
      }
    );

    const deniedActionIds = new Set(affectedRows.map((a) => a.id));

    return blockedActions.filter((a) => deniedActionIds.has(a.id));
  }

  /**
   * Whether the agent message owning this action can still resume. Resolving a blocked action
   * (approving, denying, answering, retrying) is only allowed while the message can resume:
   * otherwise it would relaunch an agent loop that was already terminated.
   */
  async canAgentMessageResume(auth: Authenticator): Promise<boolean> {
    const agentMessage = await AgentMessageModel.findOne({
      attributes: ["status"],
      where: {
        id: this.agentMessageId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return (
      agentMessage !== null &&
      !UNRESUMABLE_AGENT_MESSAGE_STATUSES.includes(agentMessage.status)
    );
  }

  /**
   * Writes output content to GCS and creates its DB rows.
   * Content is also written to DB to ease rollback during the migration period.
   */
  async createOutputItems(
    auth: Authenticator,
    contents: Array<{
      content: CallToolResult["content"][number];
      fileId?: ModelId;
    }>
  ): Promise<Result<ToolOutputItemType[], Error>> {
    // Write GCS first: the helper retries and cleans up partial batches, and DB insertion only
    // starts once every object has been persisted.
    const gcsResult = await batchWriteContentsToGcs(
      auth,
      this,
      contents.map(({ content }) => content)
    );

    if (gcsResult.isErr()) {
      return new Err(gcsResult.error);
    }

    let outputItems: AgentMCPActionOutputItemModel[];
    try {
      outputItems = await AgentMCPActionOutputItemModel.bulkCreate(
        contents.map((c, index) => {
          const contentGcsPath = gcsResult.value[index];
          assert(contentGcsPath, "GCS path not found for output item.");

          const { generatedFilePath, generatedFileContentType } =
            isToolGeneratedFilePath(c.content)
              ? {
                  generatedFilePath: c.content.resource.path,
                  generatedFileContentType: c.content.resource.contentType,
                }
              : { generatedFilePath: null, generatedFileContentType: null };

          return {
            agentMCPActionId: this.id,
            // Write content to DB (kept during migration period to ease rollback).
            content: c.content,
            contentGcsPath,
            citations: getCitationsFromToolOutput([c.content]),
            fileId: c.fileId,
            workspaceId: this.workspaceId,
            generatedFilePath,
            generatedFileContentType,
          };
        })
      );
    } catch (err) {
      // A DB error can be ambiguous after commit, so keep the GCS objects rather than risk
      // deleting content referenced by committed rows. Action-prefix cleanup removes orphans.
      return new Err(normalizeError(err));
    }

    try {
      await warmGcsContentCache(
        auth,
        removeNulls(
          outputItems.map((item) =>
            item.contentGcsPath
              ? {
                  itemId: item.id,
                  gcsPath: item.contentGcsPath,
                  content: item.content,
                }
              : null
          )
        )
      );
    } catch (err) {
      // Cache warming is best-effort and must not turn a successful persistence into a retry.
      logger.warn(
        { err: normalizeError(err), actionId: this.sId },
        "Failed to warm MCP output content cache"
      );
    }

    // Return the stored contents in the generic tool output item shape.
    return new Ok(
      removeNulls(
        outputItems.map((item) =>
          item.content
            ? {
                content: item.content,
                fileId: item.fileId ?? null,
                file: item.file ?? null,
                workspaceId: item.workspaceId,
              }
            : null
        )
      )
    );
  }

  static async fetchOutputItemsByActionIds(
    auth: Authenticator,
    {
      actionIds,
      ignoreContent,
    }: { actionIds: ModelId[]; ignoreContent: boolean }
  ): Promise<Map<number, AgentMCPActionOutputItemModel[]>> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    let outputItems: AgentMCPActionOutputItemModel[] = [];

    if (ignoreContent) {
      outputItems = await AgentMCPActionOutputItemModel.findAll({
        attributes: { exclude: ["content", "contentGcsPath"] },
        where: {
          workspaceId,
          agentMCPActionId: { [Op.in]: actionIds },
        },
      });
    } else {
      // Batch queries to avoid loading too many large (potentially TOASTed) rows at once.
      const batches = chunk(actionIds, OUTPUT_ITEMS_BATCH_SIZE);
      const batchResults = await concurrentExecutor(
        batches,
        async (batchActionIds) => {
          // Split into two parallel queries:
          // 1. GCS-backed rows: EXCLUDE content column (avoids TOAST decompression)
          // 2. Legacy rows: INCLUDE content (old rows without GCS path)
          const [gcsItems, legacyItems] = await Promise.all([
            AgentMCPActionOutputItemModel.findAll({
              attributes: { exclude: ["content"] },
              where: {
                workspaceId,
                agentMCPActionId: { [Op.in]: batchActionIds },
                contentGcsPath: { [Op.ne]: null },
              },
            }),
            AgentMCPActionOutputItemModel.findAll({
              where: {
                workspaceId,
                agentMCPActionId: { [Op.in]: batchActionIds },
                contentGcsPath: null,
              },
            }),
          ]);

          statsDMetrics.increment(
            "mcp_output_items.fetch.count",
            gcsItems.length,
            ["storage:gcs"]
          );
          statsDMetrics.increment(
            "mcp_output_items.fetch.count",
            legacyItems.length,
            ["storage:legacy"]
          );

          // Hydrate GCS-backed items from cache/GCS.
          if (gcsItems.length > 0) {
            const gcsStartMs = Date.now();
            const contentResult = await batchFetchContentsFromGcs(
              auth,
              gcsItems.map((item) => ({
                itemId: item.id,
                gcsPath: item.contentGcsPath!,
              }))
            );
            statsDMetrics.distribution(
              "mcp_output_items.gcs_hydrate.duration_ms",
              Date.now() - gcsStartMs
            );

            if (contentResult.isOk()) {
              for (const item of gcsItems) {
                const content = contentResult.value.get(item.id);
                if (content) {
                  item.content = content;
                }
              }
            } else {
              statsDMetrics.increment(
                "mcp_output_items.gcs_fallback_db.count",
                gcsItems.length
              );
              // TODO(2026-02-25 PERF): Remove this post-migration.
              // GCS read failed. We re-fetch from DB with content included.
              // This is a temporary fallback during the migration period while content is still in
              // DB. Once content column is dropped, this will become a hard error.
              logger.error(
                {
                  action: "mcp_output_items",
                  err: contentResult.error,
                  itemCount: gcsItems.length,
                  workspaceId,
                },
                "GCS read failed for MCP output items — falling back to DB"
              );
              const dbItems = await AgentMCPActionOutputItemModel.findAll({
                where: {
                  workspaceId,
                  id: { [Op.in]: gcsItems.map((item) => item.id) },
                },
              });
              const dbMap = new Map(dbItems.map((item) => [item.id, item]));
              for (const item of gcsItems) {
                const dbItem = dbMap.get(item.id);
                if (dbItem) {
                  item.content = dbItem.content;
                }
              }
            }
          }

          return [...gcsItems, ...legacyItems];
        },
        { concurrency: FETCH_OUTPUT_ITEMS_CONCURRENCY }
      );

      outputItems.push(...batchResults.flat());
    }

    const outputItemsByActionId = new Map<
      number,
      AgentMCPActionOutputItemModel[]
    >();
    for (const item of outputItems) {
      const existing = outputItemsByActionId.get(item.agentMCPActionId);
      if (existing) {
        existing.push(item);
      } else {
        outputItemsByActionId.set(item.agentMCPActionId, [item]);
      }
    }

    return outputItemsByActionId;
  }

  /**
   * Destroys output items by action IDs, cleaning up GCS files first.
   * Paths under the canonical action prefix are removed with one prefix delete
   * per action that has GCS content. Any leftover paths (e.g. legacy layouts)
   * are deleted individually. Failures are logged but do not block DB cleanup —
   * orphaned GCS files can be cleaned up later and don't cause data issues.
   */
  static async destroyOutputItemsByActionIds(
    auth: Authenticator,
    actionIds: ModelId[]
  ): Promise<void> {
    if (actionIds.length === 0) {
      return;
    }

    const workspace = auth.getNonNullableWorkspace();

    // Fetch items with GCS paths (only need contentGcsPath — no TOAST hit).
    const gcsItems = await AgentMCPActionOutputItemModel.findAll({
      attributes: ["id", "contentGcsPath"],
      where: {
        workspaceId: workspace.id,
        agentMCPActionId: { [Op.in]: actionIds },
        contentGcsPath: { [Op.ne]: null },
      },
    });

    const gcsPaths = removeNulls(gcsItems.map((item) => item.contentGcsPath));

    // Results intentionally unused. Failures must not block DB cleanup. Prefixes are deleted even
    // without persisted paths to clean objects orphaned between the GCS and DB writes.
    await deleteActionOutputsFromGcs(auth, actionIds, gcsPaths);

    // Delete all output items from DB.
    await AgentMCPActionOutputItemModel.destroy({
      where: {
        workspaceId: workspace.id,
        agentMCPActionId: { [Op.in]: actionIds },
      },
    });
  }

  static async destroyStepContentToolExecutionByActionIds(
    auth: Authenticator,
    actionIds: ModelId[]
  ) {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await AgentStepContentToolExecutionModel.destroy({
      where: {
        workspaceId,
        agentMCPActionId: { [Op.in]: actionIds },
      },
    });
  }

  static async enrichActionsWithOutputItems(
    auth: Authenticator,
    {
      actions,
      ignoreContent,
    }: {
      actions: AgentMCPActionResource[];
      ignoreContent: boolean;
    }
  ): Promise<AgentMCPActionWithOutputType[]> {
    return tracer.trace(
      "agent_mcp_action.enrich_with_output_items",
      { resource: "agent_mcp_action" },
      async (span) => {
        span?.setTag("action_count", actions.length);

        const workspaceId = auth.getNonNullableWorkspace().id;

        const outputItemsByActionId = groupBy(
          Array.from(
            (
              await this.fetchOutputItemsByActionIds(auth, {
                actionIds: actions.map((a) => a.id),
                ignoreContent,
              })
            ).values()
          ).flat(),
          "agentMCPActionId"
        );

        const fileIds = removeNulls(
          Object.values(outputItemsByActionId).flatMap((o) =>
            o.map((o) => o.fileId)
          )
        );

        const fileById = keyBy(
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
            citations: outputItems.some(
              (o) => o.citations !== null && o.citations !== undefined
            )
              ? outputItems.reduce(
                  (acc, o) => ({
                    ...acc,
                    ...(o.citations ?? {}),
                  }),
                  {}
                )
              : null,
            generatedFiles: removeNulls(
              outputItems.map((o) => {
                const file = o.file;

                if (file) {
                  return {
                    fileId: FileResource.modelIdToSId({
                      id: file.id,
                      workspaceId: file.workspaceId,
                    }),
                    contentType: file.contentType,
                    title: getFileDisplayName(file),
                    snippet: file.snippet,
                    createdAt: file.createdAt.getTime(),
                    updatedAt: file.updatedAt.getTime(),
                    isInProjectContext: file.useCase === "project_context",
                    hidden: file.useCaseMetadata?.hideFromUser ?? false,
                  };
                }

                if (isToolGeneratedFilePath(o.content)) {
                  return {
                    fileId: null,
                    filePath: o.content.resource.path,
                    title: o.content.resource.title,
                    contentType: o.content.resource.contentType,
                    snippet: null,
                    hidden: false,
                  };
                }

                // Fallback for light rendering (ignoreContent: true excludes the content column).
                if (o.generatedFilePath && o.generatedFileContentType) {
                  const filePath = o.generatedFilePath;
                  return {
                    fileId: null,
                    filePath,
                    title: filePath.split("/").pop() ?? filePath,
                    contentType: o.generatedFileContentType,
                    snippet: null,
                    hidden: false,
                  };
                }

                return null;
              })
            ),
          };
        });
      }
    );
  }

  toJSON(): AgentMCPActionType {
    assert(
      this.stepContent.value.type === "function_call",
      "Action linked to a non-function call step content."
    );

    const internalMCPServerName = this.metadata.internalMCPServerName;
    // Fallback for old actions created before these fields were added to the toolConfiguration JSONB.
    // Extract the unprefixed tool name from the function call name (e.g. "server__tool" -> "tool").
    const toolName =
      this.toolConfiguration.originalName ??
      getToolNameFromFunctionCallName(this.functionCallName);
    const mcpServerId = this.metadata.mcpServerId ?? null;

    const displayLabels = this.resolveDisplayLabels(
      internalMCPServerName,
      toolName
    );

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      agentMessageId: this.agentMessageId,
      citationsAllocated: this.citationsAllocated,
      functionCallName: this.functionCallName,
      functionCallId: this.stepContent.value.value.id,
      internalMCPServerName,
      toolName,
      mcpServerId,
      params: this.augmentedInputs,
      userEditedInputs: this.userEditedInputs,
      status: this.status,
      step: this.stepContent.step,
      executionDurationMs: this.executionDurationMs,
      displayLabels,
    };
  }

  getRunAgentChildConversationId(): string | null {
    if (
      this.metadata.internalMCPServerName !== RUN_AGENT_SERVER_NAME &&
      this.metadata.internalMCPServerName !== AGENT_DELEGATION_SERVER_NAME
    ) {
      return null;
    }

    const { resumeState } = this.stepContext;
    return isRunAgentResumeState(resumeState)
      ? resumeState.conversationId
      : null;
  }

  /**
   * Resolve displayLabels for this action. Tries dynamic input-aware labels
   * first (e.g. Searching "query"), then persisted toolConfiguration labels,
   * then falls back to static metadata for older DB records or remote server defaults.
   */
  private resolveDisplayLabels(
    internalMCPServerName: InternalMCPServerNameType | null,
    toolName: string
  ): ToolDisplayLabels | null {
    const inputs = {
      ...this.augmentedInputs,
      ...(this.userEditedInputs ?? {}),
    };
    return (
      getToolDisplayLabels({
        internalMCPServerName,
        mcpServerName: this.toolConfiguration.mcpServerName,
        toolName,
        inputs,
      }) ??
      this.toolConfiguration.displayLabels ??
      null
    );
  }

  async updateStatus(
    status: ToolExecutionStatus
  ): Promise<[affectedCount: number]> {
    return this.update({
      status,
    });
  }

  /**
   * Atomically blocks a running sandbox parent. Multiple children may block concurrently, so the
   * target status is idempotent. Every other source status is an invariant violation: in
   * particular, a late sandbox child must never rewind a final parent into a resumable state.
   */
  async blockForSandboxChild(auth: Authenticator): Promise<void> {
    await withTransaction(async (transaction) => {
      const action = await AgentMCPActionModel.findOne({
        attributes: ["id", "status"],
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      assert(action, `Sandbox parent action ${this.sId} no longer exists.`);

      if (action.status === "blocked_child_action_input_required") {
        return;
      }
      assert(
        action.status === "running",
        `Sandbox parent action ${this.sId} cannot transition from ${action.status} to blocked_child_action_input_required.`
      );

      await action.update(
        { status: "blocked_child_action_input_required" },
        { transaction }
      );
    });

    Object.assign(this, { status: "blocked_child_action_input_required" });
  }

  /**
   * Updates only if the action still has the expected status. Combined with the invariant that
   * blocked actions are denied in the same transaction as their message's terminal status update
   * (see updateAgentMessageWithFinalStatus), a blocked-status transition implies resumability.
   */
  async updateStatusFromExpected(
    auth: Authenticator,
    {
      status,
      expectedStatus,
    }: {
      status: ToolExecutionStatus;
      expectedStatus: ToolExecutionStatus;
    }
  ): Promise<[affectedCount: number]> {
    return AgentMCPActionModel.update(
      { status },
      {
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          status: expectedStatus,
        },
      }
    );
  }

  /**
   * Marks every direct authentication-blocked action from the same agent message and MCP server
   * as ready. A personal connection is scoped to the MCP server, so one completed
   * authentication can unblock parallel calls to any of its tools. Sandbox-child actions are
   * excluded because each one must thaw and relaunch its own parent bash.
   */
  async markSameMCPServerAuthenticationActionsReady(
    auth: Authenticator
  ): Promise<{
    remainingBlockedActions: AgentMCPActionResource[];
    resolvedActions: AgentMCPActionResource[];
  }> {
    const { mcpServerId } = this.metadata;
    const blockedActions =
      await AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
        agentMessageId: this.agentMessageId,
      });
    const resolvedActions = mcpServerId
      ? blockedActions.filter(
          (action) =>
            action.status === "blocked_authentication_required" &&
            // Sharing an MCP server is our proxy for the completed personal authentication being
            // reusable by this action.
            action.metadata.mcpServerId === mcpServerId &&
            !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
        )
      : [this];

    await this.model.update(
      { status: "ready_allowed_explicitly" },
      {
        where: {
          id: { [Op.in]: resolvedActions.map((action) => action.id) },
          workspaceId: auth.getNonNullableWorkspace().id,
          status: "blocked_authentication_required",
        },
      }
    );

    const resolvedActionIds = new Set(
      resolvedActions.map((action) => action.id)
    );
    const remainingBlockedActions = blockedActions.filter(
      (action) => !resolvedActionIds.has(action.id)
    );

    return { remainingBlockedActions, resolvedActions };
  }

  /**
   * Resolves the (light) agent configuration that owns this action, via the
   * action's agent message. Returns null if the agent message can't be found.
   * Keeps the agent-message model lookup inside the resource layer.
   */
  async getLightAgentConfiguration(
    auth: Authenticator
  ): Promise<LightAgentConfigurationType | null> {
    const agentMessage = await AgentMessageModel.findOne({
      attributes: ["agentConfigurationId", "agentConfigurationVersion"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.agentMessageId,
      },
    });
    if (!agentMessage) {
      return null;
    }
    const [agentConfiguration] = await getAgentConfigurationsWithVersion(
      auth,
      [
        {
          agentId: agentMessage.agentConfigurationId,
          agentVersion: agentMessage.agentConfigurationVersion,
        },
      ],
      { variant: "light" }
    );
    return agentConfiguration ?? null;
  }

  async markAsErrored({
    executionDurationMs,
  }: {
    executionDurationMs: number;
  }): Promise<void> {
    await this.update({
      status: "errored",
      executionDurationMs: Math.round(executionDurationMs),
    });
  }

  async markAsSucceeded({
    executionDurationMs,
  }: {
    executionDurationMs: number;
  }): Promise<void> {
    await this.update({
      status: "succeeded",
      executionDurationMs: Math.round(executionDurationMs),
    });
  }

  async updateStepContext(
    stepContext: StepContext
  ): Promise<[affectedCount: number]> {
    return this.update({
      stepContext,
    });
  }

  async updateUserEditedInputs(
    userEditedInputs: Record<string, unknown> | null
  ): Promise<[affectedCount: number]> {
    return this.update({
      userEditedInputs,
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

      await AgentStepContentToolExecutionModel.destroy({
        where: {
          agentMessageId: { [Op.in]: params.agentMessageIds },
          workspaceId,
        },
        transaction: params.transaction,
      });

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
      await AgentStepContentToolExecutionModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          agentMCPActionId: this.id,
        },
        transaction,
      });

      await AgentMCPActionModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
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

  get functionCallName(): string {
    return this.stepContent.value.value.name;
  }

  // The raw arguments string the model emitted, before Dust augments it with preconfigured values
  // and secrets (those land in the serialized `params`). Kept off the serialized type so it stays
  // server-side, where consumption attribution reads it.
  get functionCallArguments(): string {
    return this.stepContent.value.value.arguments;
  }
}
