import assert from "assert";
import _ from "lodash";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
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
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { ModelId, Result } from "@app/types";
import { removeNulls } from "@app/types";
import { Err, md5, Ok } from "@app/types";
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

  static async makeNew(
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
      contents = this.filterLatestVersions(contents, ["step", "index"]);

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
      // MCP actions filtering already happened in fetch methods if latestVersionsOnly was requested
      base.mcpActions = this.agentMCPActions.map(
        (action: AgentMCPAction) =>
          new MCPActionType({
            id: action.id,
            params: action.params,
            output: removeNulls(
              action.outputItems.map(hideFileFromActionOutput)
            ),
            functionCallId: action.functionCallId,
            functionCallName: action.functionCallName,
            agentMessageId: action.agentMessageId,
            step: action.step,
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

    return base;
  }

  private static async getNextVersionForStepContent(
    agentMessageId: ModelId,
    step: number,
    index: number,
    transaction?: Transaction
  ): Promise<number> {
    const existingContent = await AgentStepContentModel.findAll({
      where: {
        agentMessageId,
        step,
        index,
      },
      order: [["version", "DESC"]],
      limit: 1,
      transaction,
    });

    return existingContent.length > 0 ? existingContent[0].version + 1 : 0;
  }

  static async createNewVersion({
    agentMessageId,
    workspaceId,
    step,
    index,
    type,
    value,
    transaction,
  }: {
    agentMessageId: ModelId;
    workspaceId: ModelId;
    step: number;
    index: number;
    type: "text_content" | "reasoning" | "function_call";
    value: any;
    transaction: Transaction;
  }): Promise<AgentStepContentResource> {
    return frontSequelize.transaction(async (t: Transaction) => {
      // Acquire advisory lock for this step-index combination
      const hash = md5(
        `agent_step_content_version_${agentMessageId}_${step}_${index}`
      );

      // We need to set a lock directly.
      // eslint-disable-next-line dust/no-raw-sql
      await frontSequelize.query("SELECT pg_advisory_xact_lock(:key)", {
        transaction,
        replacements: { key: parseInt(hash, 16) % 9999999999 },
      });

      const currentMaxVersion = await this.getNextVersionForStepContent(
        agentMessageId,
        step,
        index,
        t
      );

      const existingContent = await AgentStepContentModel.findOne({
        where: {
          agentMessageId,
          step,
          index,
          version: currentMaxVersion,
        },
        transaction: t,
      });

      if (existingContent) {
        throw new Error(
          `Agent step content version ${currentMaxVersion} for step ${step}, index ${index} already exists`
        );
      }

      return AgentStepContentResource.makeNew(
        {
          agentMessageId,
          workspaceId,
          step,
          index,
          version: currentMaxVersion,
          type,
          value,
        },
        t
      );
    });
  }
}
