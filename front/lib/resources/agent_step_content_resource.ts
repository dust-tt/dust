import assert from "assert";
import _ from "lodash";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import { isToolGeneratedFile } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { hideFileFromActionOutput } from "@app/lib/actions/mcp_utils";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { ModelId, Result } from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentStepContentType,
  FunctionCallContentType,
} from "@app/types/assistant/agent_message_content";
import { isFunctionCallContent } from "@app/types/assistant/agent_message_content";

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
      agentMCPActions?: AgentMCPActionModel[];
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
  ): Promise<ModelId[]> {
    const uniqueAgentMessageIds = [...new Set(agentMessageIds)];

    const agentMessages = await AgentMessage.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
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
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentIds: uniqueAgentIds,
          found: agentConfigurations.map((a) => a.sId),
        },
        "User does not have access to agents"
      );
    }

    const allowedAgentIds = new Set(agentConfigurations.map((a) => a.sId));
    return agentMessages
      .filter((a) => allowedAgentIds.has(a.agentConfigurationId))
      .map((a) => a.id);
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

  public static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[]
  ): Promise<AgentStepContentResource[]> {
    const contents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: { [Op.in]: ids },
      },
    });

    return contents.map((content) => new this(this.model, content.get()));
  }

  public static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId
  ): Promise<AgentStepContentResource | null> {
    const stepContents = await this.fetchByModelIds(auth, [id]);

    return stepContents[0] ?? null;
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
    const allowedAgentMessageIds = await this.checkAgentMessageAccess(
      auth,
      agentMessageIds
    );

    let contents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: owner.id,
        agentMessageId: {
          [Op.in]: allowedAgentMessageIds,
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
        await AgentMCPActionModel.findAll({
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
            c.agentMCPActions as AgentMCPActionModel[],
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

  isFunctionCallContent(): this is AgentStepContentResource & {
    value: FunctionCallContentType;
  } {
    return isFunctionCallContent(this.value);
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

    const allowedAgentMessageIds =
      await AgentStepContentResource.checkAgentMessageAccess(auth, [
        this.agentMessageId,
      ]);

    if (allowedAgentMessageIds.length === 0) {
      return new Err(new Error("User does not have access to agents"));
    }

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
        // TODO(durable-agents): use AgentMCPActionResource.toJSON(), which may require moving
        //  its constructor to the AgentStepContentResource instead of the model.
        base.mcpActions = this.agentMCPActions.map(
          (action: AgentMCPActionModel) => {
            const mcpServerId = action.toolConfiguration?.toolServerId || null;

            return {
              id: action.id,
              agentMessageId: action.agentMessageId,
              functionCallName: value.value.name,
              internalMCPServerName:
                getInternalMCPServerNameFromSId(mcpServerId),
              mcpServerId,
              params: JSON.parse(value.value.arguments),
              status: action.status,
              output: removeNulls(
                action.outputItems.map(hideFileFromActionOutput)
              ),
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

                  const hidden =
                    o.content.type === "resource" &&
                    isToolGeneratedFile(o.content) &&
                    o.content.resource.hidden === true;

                  return {
                    fileId: fileSid,
                    contentType: file.contentType,
                    title: file.fileName,
                    snippet: file.snippet,
                    ...(hidden ? { hidden: true } : {}),
                  };
                })
              ),
            } satisfies AgentMCPActionWithOutputType;
          }
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
    return withTransaction(async (transaction: Transaction) => {
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
}
