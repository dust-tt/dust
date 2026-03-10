import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameFromSId,
  getInternalMCPServerToolDisplayLabels,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { isToolGeneratedFile } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getDefaultRemoteMCPServerByName } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { hideFileFromActionOutput } from "@app/lib/actions/mcp_utils";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import {
  isToolExecutionStatusBlocked,
  TOOL_EXECUTION_BLOCKED_STATUSES,
} from "@app/lib/actions/statuses";
import type { StepContext } from "@app/lib/actions/types";
import { isFileAuthorizationInfo } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfigurationsWithVersion } from "@app/lib/api/assistant/configuration/agent";
import type { ToolDisplayLabels } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
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
  deleteContentsFromGcs,
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
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import type {
  AgentMCPActionType,
  AgentMCPActionWithOutputType,
} from "@app/types/actions";
import type { AgentFunctionCallContentType } from "@app/types/assistant/agent_message_content";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
// biome-ignore lint/plugin/noBulkLodash: existing usage
import _ from "lodash";
import type {
  Attributes,
  CreationAttributes,
  NonAttribute,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

// Batch size for fetching output items to avoid loading too many large rows at once.
const OUTPUT_ITEMS_BATCH_SIZE = 32;

const FETCH_OUTPUT_ITEMS_CONCURRENCY = 2;

const CONCURRENCY_UPDATE_OUTPUT_ITEMS = 16;

function getDefaultRemoteDisplayLabels(
  mcpServerName: string,
  toolName: string
): ToolDisplayLabels | null {
  const server = getDefaultRemoteMCPServerByName(mcpServerName);
  return server?.toolDisplayLabels?.[toolName] ?? null;
}

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
    conversation: ConversationResource
  ): Promise<BlockedToolExecution[]> {
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
    const blockedActions = await AgentMCPActionModel.findAll({
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
        agentMessageId: { [Op.in]: latestAgentMessageIds },
        status: {
          [Op.in]: TOOL_EXECUTION_BLOCKED_STATUSES,
        },
      },
      order: [["createdAt", "ASC"]],
    });

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

    const parentUserMessageById = _.keyBy(parentUserMessages, "id");

    const blockedActionsList: BlockedToolExecution[] = [];

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
      MCPServerViewResource.fetchByIds(auth, mcpServerViewIds),
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

      const authorizationInfo =
        mcpServerView?.toJSON().server.authorization ?? null;

      const mcpServerId = mcpServerView?.mcpServerId;
      const mcpServerDisplayName = mcpServerView
        ? getMcpServerViewDisplayName(mcpServerView.toJSON())
        : undefined;

      const parentUserMessage =
        parentUserMessageById[agentMessage.message.parentId!];

      assert(parentUserMessage.userMessage, "Parent user message not found.");

      const baseActionParams: Omit<
        BlockedToolExecution,
        "status" | "authorizationInfo"
      > = {
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
          agentName: agentConfiguration.name,
          icon: action.toolConfiguration.icon,
        },
        argumentsRequiringApproval: isLightServerSideMCPToolConfiguration(
          action.toolConfiguration
        )
          ? action.toolConfiguration.argumentsRequiringApproval
          : undefined,
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

  /**
   * Creates output items in DB and writes their content to GCS.
   * Content is also written to DB to ease rollback during the migration period.
   */
  async createOutputItems(
    auth: Authenticator,
    contents: Array<{
      content: CallToolResult["content"][number];
      fileId?: ModelId;
    }>
  ): Promise<AgentMCPActionOutputItemModel[]> {
    const outputItems = await AgentMCPActionOutputItemModel.bulkCreate(
      contents.map((c) => ({
        agentMCPActionId: this.id,
        // Write content to DB (kept during migration period to ease rollback).
        content: c.content,
        fileId: c.fileId,
        workspaceId: this.workspaceId,
      }))
    );

    const gcsResult = await batchWriteContentsToGcs(
      auth,
      this,
      outputItems.map((item) => ({
        itemId: item.id,
        content: item.content,
      }))
    );

    // On GCS failure during migration period, items remain as legacy rows (content read from DB).
    // Once content column is dropped, this must become a hard error.
    if (gcsResult.isErr()) {
      return outputItems;
    }

    // Update DB rows with their GCS paths.
    // TODO(2026-02-25 PERF): Optimize by writing items only once.
    await concurrentExecutor(
      outputItems,
      async (item) => {
        const gcsPath = gcsResult.value.get(item.id);
        if (gcsPath) {
          await AgentMCPActionOutputItemModel.update(
            { contentGcsPath: gcsPath },
            { where: { id: item.id, workspaceId: this.workspaceId } }
          );
          item.contentGcsPath = gcsPath;
        }
      },
      { concurrency: CONCURRENCY_UPDATE_OUTPUT_ITEMS }
    );

    return outputItems;
  }

  static async fetchOutputItemsByActionIds(
    auth: Authenticator,
    actionIds: ModelId[]
  ): Promise<Map<number, AgentMCPActionOutputItemModel[]>> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Batch queries to avoid loading too many large (potentially TOASTed) rows at once.
    const batches = _.chunk(actionIds, OUTPUT_ITEMS_BATCH_SIZE);
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

        const statsDClient = getStatsDClient();

        statsDClient.increment(
          "mcp_output_items.fetch.count",
          gcsItems.length,
          ["storage:gcs"]
        );
        statsDClient.increment(
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
          statsDClient.distribution(
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
            statsDClient.increment(
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

    const outputItemsByActionId = new Map<
      number,
      AgentMCPActionOutputItemModel[]
    >();
    for (const item of batchResults.flat()) {
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
   * GCS deletion failures are logged but do not block DB cleanup — orphaned
   * GCS files can be cleaned up later and don't cause data issues.
   */
  static async destroyOutputItemsByActionIds(
    auth: Authenticator,
    actionIds: ModelId[]
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Fetch items with GCS paths (only need id + contentGcsPath — no TOAST hit).
    const gcsItems = await AgentMCPActionOutputItemModel.findAll({
      attributes: ["id", "contentGcsPath"],
      where: {
        workspaceId,
        agentMCPActionId: { [Op.in]: actionIds },
        contentGcsPath: { [Op.ne]: null },
      },
    });

    // TODO(2026-02-25 PERF): Remove this post-migration.
    // Delete GCS files. Failures are logged inside deleteContentsFromGcs but do not block DB
    // cleanup.
    if (gcsItems.length > 0) {
      await deleteContentsFromGcs(
        removeNulls(gcsItems.map((item) => item.contentGcsPath))
      );
    }

    // Delete all output items from DB.
    await AgentMCPActionOutputItemModel.destroy({
      where: {
        workspaceId,
        agentMCPActionId: { [Op.in]: actionIds },
      },
    });
  }

  static async enrichActionsWithOutputItems(
    auth: Authenticator,
    actions: AgentMCPActionResource[]
  ): Promise<AgentMCPActionWithOutputType[]> {
    return tracer.trace(
      "agent_mcp_action.enrich_with_output_items",
      { resource: "agent_mcp_action" },
      async (span) => {
        span?.setTag("action_count", actions.length);

        const workspaceId = auth.getNonNullableWorkspace().id;

        const outputItemsByActionId = _.groupBy(
          Array.from(
            (
              await this.fetchOutputItemsByActionIds(
                auth,
                actions.map((a) => a.id)
              )
            ).values()
          ).flat(),
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
                  createdAt: file.createdAt.getTime(),
                  updatedAt: file.updatedAt.getTime(),
                  isInProjectContext: file.useCase === "project_context",
                  ...(hidden ? { hidden: true } : {}),
                };
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
      this.functionCallName.split(TOOL_NAME_SEPARATOR).at(-1) ??
      this.functionCallName;
    const mcpServerId = this.metadata.mcpServerId ?? null;

    const displayLabels = internalMCPServerName
      ? (getInternalMCPServerToolDisplayLabels(internalMCPServerName)?.[
          toolName
        ] ?? null)
      : getDefaultRemoteDisplayLabels(
          this.toolConfiguration.mcpServerName,
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
      status: this.status,
      step: this.stepContent.step,
      executionDurationMs: this.executionDurationMs,
      displayLabels,
    };
  }

  async updateStatus(
    status: ToolExecutionStatus
  ): Promise<[affectedCount: number]> {
    return this.update({
      status,
    });
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
}
