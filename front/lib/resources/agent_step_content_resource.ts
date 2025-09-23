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

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionModel } from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import {
  AgentMessage,
  ConversationModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType, ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";
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
      latestVersionsOnly = false,
    }: {
      agentMessageIds: ModelId[];
      transaction?: Transaction;
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

    if (latestVersionsOnly) {
      contents = this.filterLatestVersions(contents, [
        "agentMessageId",
        "step",
        "index",
      ]);
    }

    return contents.map(
      (content) =>
        new AgentStepContentResource(AgentStepContentModel, content.get())
    );
  }

  static async listFunctionCallsForAgent(
    auth: Authenticator,
    {
      agentConfiguration,
      limit,
      cursor,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      limit: number;
      cursor?: Date;
    }
  ): Promise<{
    stepContents: AgentStepContentResource[];
    totalCount: number;
    nextCursor: string | null;
  }> {
    const owner = auth.getNonNullableWorkspace();

    const whereClause: WhereOptions<AgentStepContentModel> = {
      workspaceId: owner.id,
      type: "function_call",
    };

    if (cursor) {
      whereClause.createdAt = {
        [Op.lt]: cursor,
      };
    }

    const includeClause: IncludeOptions[] = [
      {
        model: AgentMessage,
        as: "agentMessage",
        required: true,
        where: {
          agentConfigurationId: agentConfiguration.sId,
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
    ];

    const [totalCount, stepContents] = await Promise.all([
      AgentStepContentModel.count({
        include: includeClause,
        where: whereClause,
        distinct: true,
      }),
      AgentStepContentModel.findAll({
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

    const resources = actualStepContents.map((stepContent) => {
      return new this(this.model, stepContent.get());
    });

    return {
      stepContents: resources,
      totalCount,
      nextCursor,
    };
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

    return {
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
