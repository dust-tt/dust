import assert from "assert";
import _ from "lodash";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import { hideFileFromActionOutput, MCPActionType } from "@app/lib/actions/mcp";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
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
import type { ModelId, Result } from "@app/types";
import { removeNulls } from "@app/types";
import { Err, Ok } from "@app/types";
import type { AgentStepContentType } from "@app/types/assistant/agent_message_content";

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

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentStepContentResource
  extends ReadonlyAttributesType<AgentStepContentModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentStepContentResource extends BaseResource<AgentStepContentModel> {
  static model: ModelStatic<AgentStepContentModel> = AgentStepContentModel;

  constructor(
    model: ModelStatic<AgentStepContentModel>,
    blob: Attributes<AgentStepContentModel>
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
    const agentConfigurations = await getAgentConfigurations({
      auth,
      agentsGetView: {
        agentIds: uniqueAgentIds,
      },
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
   * Helper to build the include clause for MCP actions
   */
  private static buildMCPActionsInclude({
    includeMCPActions,
  }: {
    includeMCPActions: boolean;
  }) {
    if (!includeMCPActions) {
      return [];
    }

    return [
      {
        model: AgentMCPAction,
        as: "agentMCPActions",
        required: false,
        include: [
          {
            model: AgentMCPActionOutputItem,
            as: "outputItems",
            required: false,
            include: [
              {
                model: FileModel,
                as: "file",
                required: false,
              },
            ],
          },
        ],
      },
    ];
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

  /**
   * Helper to create resources from models
   */
  private static createResources(
    contents: AgentStepContentModel[]
  ): AgentStepContentResource[] {
    return contents.map(
      (content) =>
        new AgentStepContentResource(AgentStepContentModel, content.get())
    );
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

    const include = this.buildMCPActionsInclude({
      includeMCPActions,
    });

    let contents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId: {
          [Op.in]: agentMessageIds,
        },
      },
      include,
      order: [
        ["step", "ASC"],
        ["index", "ASC"],
        ["version", "DESC"],
      ],
      transaction,
    });

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

    return this.createResources(contents);
  }

  static async fetchByAgentMessageAndStep(
    auth: Authenticator,
    {
      agentMessageId,
      step,
      transaction,
      includeMCPActions = false,
      latestVersionsOnly = false,
    }: {
      agentMessageId: ModelId;
      step: number;
      transaction?: Transaction;
      includeMCPActions?: boolean;
      latestVersionsOnly?: boolean;
    }
  ): Promise<AgentStepContentResource[]> {
    const owner = auth.getNonNullableWorkspace();

    // Check authorization - will throw if unauthorized
    await this.checkAgentMessageAccess(auth, [agentMessageId]);

    const include = this.buildMCPActionsInclude({
      includeMCPActions,
    });

    const agentStepContents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId,
        step,
      },
      include,
      order: [
        ["index", "ASC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    let contents = agentStepContents;

    if (latestVersionsOnly) {
      contents = this.filterLatestVersions(contents, ["index"]);

      // Also filter MCP actions to latest versions if included
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

    return this.createResources(contents);
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
    { agentConfigurationId, limit, cursor }: GetMCPActionsOptions
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

    try {
      // Get total count for pagination
      const totalCount = await AgentStepContentModel.count({
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
          {
            model: AgentMCPAction,
            as: "agentMCPActions",
            required: true,
          },
        ],
        where: whereClause,
      });

      // Get all function call step contents with their MCP actions
      const stepContents = await AgentStepContentModel.findAll({
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
          {
            model: AgentMCPAction,
            as: "agentMCPActions",
            required: true,
          },
        ],
        where: whereClause,
        order: [["createdAt", "DESC"]],
        limit: limit + 1, // Fetch one extra to determine if there are more results
      });

      // Determine if there are more results and get the actual results
      const hasMore = stepContents.length > limit;
      const actualStepContents = hasMore ? stepContents.slice(0, limit) : stepContents;
      const nextCursor = hasMore
        ? actualStepContents[actualStepContents.length - 1].createdAt.toISOString()
        : null;

      // Flatten MCP actions from step contents
      const actionsData: AnalyticsMCPAction[] = [];
      for (const stepContent of actualStepContents) {
        if (stepContent.agentMCPActions) {
          for (const action of stepContent.agentMCPActions) {
            actionsData.push(serializeMCPActionFromStepContent(stepContent, action));
          }
        }
      }

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

function serializeMCPActionFromStepContent(
  stepContent: AgentStepContentModel,
  action: AgentMCPAction
): AnalyticsMCPAction {
  assert(stepContent.agentMessage, "Agent message must exist");
  assert(stepContent.agentMessage.message, "Message must exist");
  assert(stepContent.agentMessage.message.conversation, "Conversation must exist");
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
}
