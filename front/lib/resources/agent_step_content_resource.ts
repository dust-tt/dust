import assert from "assert";
import _ from "lodash";
import type {
  Attributes,
  CreationAttributes,
  IncludeOptions,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import { MCPActionType } from "@app/lib/actions/mcp";
import { hideFileFromActionOutput } from "@app/lib/actions/mcp_utils";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import {
  AgentMessage,
  ConversationModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileModel } from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { GetMCPActionsResult } from "@app/pages/api/w/[wId]/labs/mcp_actions/[agentId]";
import type { ModelId, Result } from "@app/types";
import { removeNulls } from "@app/types";
import { Err, Ok } from "@app/types";
import type { AgentStepContentType } from "@app/types/assistant/agent_message_content";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentStepContentResource
  extends ReadonlyAttributesType<AgentStepContentModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentStepContentResource extends BaseResource<AgentStepContentModel> {
  static model: ModelStatic<AgentStepContentModel> = AgentStepContentModel;

  constructor(
    model: ModelStatic<AgentStepContentModel>,
    blob: Attributes<AgentStepContentModel> & {
      agentMCPActions?: AgentMCPAction[];
    }
  ) {
    super(AgentStepContentModel, blob);
  }

  /**
   * Helper function to check if the user can read the agent message
   * and fetch the agent configuration.
   */
  private static async checkAgentMessageAccess(
    auth: Authenticator,
    agentMessageIds: ModelId[]
  ): Promise<void> {
    const uniqueAgentMessageIds = [...new Set(agentMessageIds)];

    const agentMessages = await AgentMessage.findAll({
      where: {
        id: { [Op.in]: uniqueAgentMessageIds },
      },
    });

    assert(
      agentMessages.length === uniqueAgentMessageIds.length,
      "Unexpected: missing agent messages"
    );

    const uniqueAgentIds = [
      ...new Set(agentMessages.map((a) => a.agentConfigurationId)),
    ];
    // Fetch agent configuration to check permissions
    const agentConfigurations = await getAgentConfigurations(auth, {
      agentIds: uniqueAgentIds,
      variant: "light",
    });

    if (agentConfigurations.length !== uniqueAgentIds.length) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentIds: uniqueAgentIds,
          found: agentConfigurations.map((a) => a.sId),
        },
        "User does not have access to agents"
      );
      throw new Error("Unexpected: User does not have access to all agents");
    }
  }

  private static async makeNew(
    blob: CreationAttributes<AgentStepContentModel>,
    transaction?: Transaction
  ): Promise<AgentStepContentResource> {
    const agentStepContent = await AgentStepContentModel.create(blob, {
      transaction,
    });

    return new AgentStepContentResource(
      AgentStepContentModel,
      agentStepContent.get()
    );
  }

  get sId(): string {
    return AgentStepContentResource.modelIdToSId({
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
    return makeSId("agent_step_content", {
      id,
      workspaceId,
    });
  }

  /**
   * Helper to filter latest versions from fetched content
   */
  private static filterLatestVersions(
    contents: AgentStepContentModel[],
    groupByFields: string[]
  ): AgentStepContentModel[] {
    const grouped = _.groupBy(contents, (content) =>
      groupByFields
        .map((field) => content[field as keyof AgentStepContentModel])
        .join("-")
    );

    // For each group, keep only the first item (already sorted by version DESC)
    return Object.values(grouped).map((group) => group[0]);
  }

  static async fetchByAgentMessages(
    auth: Authenticator,
    {
      agentMessageIds,
      transaction,
      includeMCPActions = false,
      latestVersionsOnly = false,
    }: {
      agentMessageIds: ModelId[];
      transaction?: Transaction;
      includeMCPActions?: boolean;
      latestVersionsOnly?: boolean;
    }
  ): Promise<AgentStepContentResource[]> {
    const owner = auth.getNonNullableWorkspace();

    // Check authorization - will throw if unauthorized
    await this.checkAgentMessageAccess(auth, agentMessageIds);

    let contents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId: {
          [Op.in]: agentMessageIds,
        },
      },
      order: [
        ["step", "ASC"],
        ["index", "ASC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    if (includeMCPActions) {
      const contentIds: ModelId[] = contents.map((c) => c.id);

      const mcpActionsByContentId = _.groupBy(
        await AgentMCPAction.findAll({
          where: {
            workspaceId: owner.id,
            stepContentId: {
              [Op.in]: contentIds,
            },
          },
        }),
        "stepContentId"
      );

      const actionIds = Object.values(mcpActionsByContentId).flatMap((a) =>
        a.map((a) => a.id)
      );

      const outputItemsByActionId = _.groupBy(
        await AgentMCPActionOutputItem.findAll({
          where: {
            workspaceId: owner.id,
            agentMCPActionId: {
              [Op.in]: actionIds,
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
        await FileModel.findAll({
          where: {
            workspaceId: owner.id,
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

      for (const actions of Object.values(mcpActionsByContentId)) {
        for (const action of actions) {
          action.outputItems =
            outputItemsByActionId[action.id.toString()] ?? [];
        }
      }

      for (const content of contents) {
        content.agentMCPActions =
          mcpActionsByContentId[content.id.toString()] ?? [];
      }
    }

    if (latestVersionsOnly) {
      contents = this.filterLatestVersions(contents, [
        "agentMessageId",
        "step",
        "index",
      ]);

      // Also filter MCP actions to latest versions
      if (includeMCPActions) {
        contents.forEach((c) => {
          if (!("agentMCPActions" in c)) {
            return;
          }
          const maxVersionAction = _.maxBy(
            c.agentMCPActions as AgentMCPAction[],
            "version"
          );
          c.agentMCPActions = maxVersionAction ? [maxVersionAction] : [];
        });
      }
    }

    return contents.map(
      (content) =>
        new AgentStepContentResource(AgentStepContentModel, {
          ...content.get(),
          agentMCPActions: content.agentMCPActions,
        })
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number | undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    if (this.workspaceId !== owner.id) {
      return new Err(
        new Error("Cannot delete agent step content from another workspace")
      );
    }

    await AgentStepContentResource.checkAgentMessageAccess(auth, [
      this.agentMessageId,
    ]);

    const deletedCount = await AgentStepContentModel.destroy({
      where: {
        id: this.id,
        workspaceId: owner.id,
      },
      transaction,
    });

    return new Ok(deletedCount);
  }

  toJSON(): AgentStepContentType {
    let value = this.value;
    if (this.type === "reasoning" && value.type === "reasoning") {
      value = {
        ...value,
        value: {
          ...value.value,
          // TODO(DURABLE-AGENTS 2025-07-16): remove defaults once backfill is done.
          tokens: value.value.tokens ?? 0,
          provider: value.value.provider ?? "openai",
        },
      };
    }

    const base: AgentStepContentType = {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      agentMessageId: this.agentMessageId,
      step: this.step,
      index: this.index,
      version: this.version,
      type: this.type,
      value,
    };

    if ("agentMCPActions" in this && Array.isArray(this.agentMCPActions)) {
      if (this.agentMCPActions.length === 0) {
        base.mcpActions = [];
      } else {
        const { value } = this;
        assert(
          value.type === "function_call",
          "Unexpected: MCP actions on non-function call step content"
        );
        // MCP actions filtering already happened in fetch methods if latestVersionsOnly was requested
        base.mcpActions = this.agentMCPActions.map(
          (action: AgentMCPAction) =>
            new MCPActionType({
              id: action.id,
              params: JSON.parse(value.value.arguments),
              output: removeNulls(
                action.outputItems.map(hideFileFromActionOutput)
              ),
              functionCallId: value.value.id,
              functionCallName: value.value.name,
              agentMessageId: action.agentMessageId,
              step: this.step,
              mcpServerConfigurationId: action.mcpServerConfigurationId,
              executionState: action.executionState,
              isError: action.isError,
              type: "tool_action",
              citationsAllocated: action.citationsAllocated,
              generatedFiles: removeNulls(
                action.outputItems.map((o) => {
                  if (!o.file) {
                    return null;
                  }

                  const file = o.file;
                  const fileSid = FileResource.modelIdToSId({
                    id: file.id,
                    workspaceId: action.workspaceId,
                  });

                  return {
                    fileId: fileSid,
                    contentType: file.contentType,
                    title: file.fileName,
                    snippet: file.snippet,
                  };
                })
              ),
            })
        );
      }
    }

    return base;
  }

  static async createNewVersion({
    agentMessageId,
    workspaceId,
    step,
    index,
    type,
    value,
  }: Omit<
    CreationAttributes<AgentStepContentModel>,
    "version"
  >): Promise<AgentStepContentResource> {
    return frontSequelize.transaction(async (transaction: Transaction) => {
      const existingContent = await this.model.findAll({
        where: {
          agentMessageId,
          step,
          index,
        },
        order: [["version", "DESC"]],
        attributes: ["version"],
        limit: 1,
        transaction,
      });

      const currentMaxVersion =
        existingContent.length > 0 ? existingContent[0].version + 1 : 0;

      return this.makeNew(
        {
          agentMessageId,
          workspaceId,
          step,
          index,
          version: currentMaxVersion,
          type,
          value,
        },
        transaction
      );
    });
  }

  static async getMCPActionsForAgent(
    auth: Authenticator,
    {
      agentConfigurationId,
      limit,
      cursor,
    }: {
      agentConfigurationId: string;
      limit: number;
      cursor?: string;
    }
  ): Promise<Result<GetMCPActionsResult, Error>> {
    const owner = auth.getNonNullableWorkspace();

    const whereClause: WhereOptions<AgentStepContentModel> = {
      workspaceId: owner.id,
      type: "function_call",
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

    const includeClause: IncludeOptions[] = [
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
      {
        model: AgentMCPAction,
        as: "agentMCPActions",
        required: true,
      },
    ];

    const [totalCount, stepContents] = await Promise.all([
      this.model.count({
        include: includeClause,
        where: whereClause,
      }),
      this.model.findAll({
        include: includeClause,
        where: whereClause,
        order: [["createdAt", "DESC"]],
        limit: limit + 1,
      }),
    ]);

    const hasMore = stepContents.length > limit;
    const actualStepContents = hasMore
      ? stepContents.slice(0, limit)
      : stepContents;
    const nextCursor = hasMore
      ? actualStepContents[
          actualStepContents.length - 1
        ].createdAt.toISOString()
      : null;

    const actions = actualStepContents.flatMap((stepContent) =>
      (stepContent.agentMCPActions || []).map((action) => {
        assert(
          stepContent.agentMessage?.message?.conversation,
          "Missing required relations"
        );
        assert(
          stepContent.value.type === "function_call",
          "Step content must be a function call"
        );

        return {
          sId: MCPActionType.modelIdToSId({
            id: action.id,
            workspaceId: action.workspaceId,
          }),
          createdAt: action.createdAt.toISOString(),
          functionCallName: stepContent.value.value.name,
          params: JSON.parse(stepContent.value.value.arguments),
          executionState: action.executionState,
          isError: action.isError,
          conversationId: stepContent.agentMessage.message.conversation.sId,
          messageId: stepContent.agentMessage.message.sId,
        };
      })
    );

    return new Ok({
      actions,
      nextCursor,
      totalCount,
    });
  }
}
