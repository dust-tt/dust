import type {
  CreationAttributes,
  InferAttributes,
  Transaction,
} from "sequelize";
import { col, fn, literal, Op, Sequelize, where } from "sequelize";

import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/assistant/actions/conversation_mcp_server_view";
import {
  AgentMessage,
  ConversationModel,
  ConversationParticipantModel,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  ConversationMCPServerViewType,
  ConversationType,
  ConversationVisibility,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  Result,
} from "@app/types";
import { ConversationError, Err, normalizeError, Ok } from "@app/types";

import { GroupResource } from "./group_resource";
import type { ModelStaticWorkspaceAware } from "./storage/wrappers/workspace_models";
import type { ResourceFindOptions } from "./types";

export type FetchConversationOptions = {
  includeDeleted?: boolean;
  includeTest?: boolean;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationResource
  extends ReadonlyAttributesType<ConversationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationResource extends BaseResource<ConversationModel> {
  static model: ModelStaticWorkspaceAware<ConversationModel> =
    ConversationModel;

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<ConversationModel>, "workspaceId">
  ): Promise<ConversationResource> {
    const workspace = auth.getNonNullableWorkspace();
    const conversation = await this.model.create({
      ...blob,
      workspaceId: workspace.id,
    });

    return new ConversationResource(
      ConversationResource.model,
      conversation.get()
    );
  }

  private static getOptions(
    options?: FetchConversationOptions
  ): ResourceFindOptions<ConversationModel> {
    if (options?.includeDeleted) {
      return {
        where: {},
      };
    }

    return {
      where: {
        visibility: { [Op.ne]: "deleted" },
      },
    };
  }

  private static async baseFetch(
    auth: Authenticator,
    fetchConversationOptions?: FetchConversationOptions,
    options: ResourceFindOptions<ConversationModel> = {}
  ) {
    const workspace = auth.getNonNullableWorkspace();
    const { where } = this.getOptions(fetchConversationOptions);

    const conversations = await this.model.findAll({
      where: {
        ...where,
        ...options.where,
        workspaceId: workspace.id,
      },
      limit: options.limit,
    });

    return conversations.map((c) => new this(this.model, c.get()));
  }

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[],
    options?: FetchConversationOptions
  ) {
    return this.baseFetch(auth, options, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: sIds,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    sId: string,
    options?: FetchConversationOptions
  ): Promise<ConversationResource | null> {
    const res = await this.fetchByIds(auth, [sId], options);

    return res.length > 0 ? res[0] : null;
  }

  static async listAll(
    auth: Authenticator,
    options?: FetchConversationOptions
  ): Promise<ConversationResource[]> {
    return this.baseFetch(auth, options);
  }

  static async listMentionsByConfiguration(
    auth: Authenticator,
    {
      agentConfiguration,
      rankingUsageDays,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      rankingUsageDays: number;
    }
  ) {
    const workspace = auth.getNonNullableWorkspace();

    const mentions = await this.model.findAll({
      attributes: [
        [Sequelize.literal('"messages->userMessage"."userId"'), "userId"],
        [
          Sequelize.fn("COUNT", Sequelize.literal('"messages->mentions"."id"')),
          "count",
        ],
      ],
      where: {
        workspaceId: workspace.id,
      },
      include: [
        {
          model: Message,
          required: true,
          attributes: [],
          include: [
            {
              model: Mention,
              as: "mentions",
              required: true,
              attributes: [],
              where: {
                ...(agentConfiguration
                  ? { agentConfigurationId: agentConfiguration.sId }
                  : {}),
                createdAt: {
                  [Op.gt]: literal(
                    `NOW() - INTERVAL '${rankingUsageDays} days'`
                  ),
                },
              },
            },
            {
              model: UserMessage,
              as: "userMessage",
              required: true,
              attributes: [],
            },
          ],
        },
      ],
      order: [["count", "DESC"]],
      group: ['"messages->userMessage"."userId"'],
      raw: true,
    });

    return mentions;
  }

  static async listAllBeforeDate({
    auth,
    cutoffDate,
    batchSize = 1000,
  }: {
    auth: Authenticator;
    cutoffDate: Date;
    batchSize?: number;
  }): Promise<ConversationResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const inactiveConversations = await Message.findAll({
      attributes: [
        "conversationId",
        [fn("MAX", col("createdAt")), "lastMessageDate"],
      ],
      where: {
        workspaceId,
      },
      group: ["conversationId"],
      having: where(fn("MAX", col("createdAt")), "<", cutoffDate),
      order: [[fn("MAX", col("createdAt")), "DESC"]],
    });

    // We batch to avoid a big where in clause.
    const results: ConversationResource[] = [];
    for (let i = 0; i < inactiveConversations.length; i += batchSize) {
      const batch = inactiveConversations.slice(i, i + batchSize);
      const conversations = await ConversationModel.findAll({
        where: {
          workspaceId,
          id: {
            [Op.in]: batch.map((m) => m.conversationId),
          },
        },
      });
      results.push(...conversations.map((c) => new this(this.model, c.get())));
    }

    return results;
  }
  static async listConversationWithAgentCreatedBeforeDate({
    auth,
    agentConfigurationId,
    cutoffDate,
  }: {
    auth: Authenticator;
    agentConfigurationId: string;
    cutoffDate: Date;
  }): Promise<string[]> {
    // Find all conversations that:
    // 1. Were created before the cutoff date.
    // 2. Have at least one message from the specified agent.
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Two-step approach for better performance:
    // Step 1: Get distinct conversation IDs that have messages from this agent.
    const messageWithAgent = await Message.findAll({
      attributes: [
        [
          Sequelize.fn("DISTINCT", Sequelize.col("conversationId")),
          "conversationId",
        ],
      ],
      where: {
        workspaceId,
      },
      include: [
        {
          model: AgentMessage,
          as: "agentMessage",
          required: true,
          attributes: [],
          where: {
            agentConfigurationId,
          },
        },
      ],
      raw: true,
    });

    if (messageWithAgent.length === 0) {
      return [];
    }

    // Step 2: Filter conversations by creation date.
    const conversationIds = messageWithAgent.map((m) => m.conversationId);
    const conversations = await this.model.findAll({
      where: {
        workspaceId,
        id: {
          [Op.in]: conversationIds,
        },
        createdAt: {
          [Op.lt]: cutoffDate,
        },
      },
    });

    return conversations.map((c) => c.sId);
  }

  static canAccessConversation(
    auth: Authenticator,
    conversation:
      | ConversationWithoutContentType
      | ConversationType
      | ConversationResource
  ): boolean {
    const requestedGroupIds =
      conversation instanceof ConversationResource
        ? conversation.getConversationRequestedGroupIdsFromModel(auth)
        : conversation.requestedGroupIds;

    return auth.canRead(
      Authenticator.createResourcePermissionsFromGroupIds(requestedGroupIds)
    );
  }

  static async fetchConversationWithoutContent(
    auth: Authenticator,
    sId: string,
    options?: FetchConversationOptions & {
      dangerouslySkipPermissionFiltering?: boolean;
    }
  ): Promise<Result<ConversationWithoutContentType, ConversationError>> {
    const owner = auth.getNonNullableWorkspace();

    const conversation = await this.fetchById(auth, sId, {
      includeDeleted: options?.includeDeleted,
    });

    if (!conversation) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    if (
      !options?.dangerouslySkipPermissionFiltering &&
      !ConversationResource.canAccessConversation(auth, conversation)
    ) {
      return new Err(new ConversationError("conversation_access_restricted"));
    }

    return new Ok({
      id: conversation.id,
      created: conversation.createdAt.getTime(),
      sId: conversation.sId,
      owner,
      title: conversation.title,
      visibility: conversation.visibility,
      depth: conversation.depth,
      requestedGroupIds:
        conversation.getConversationRequestedGroupIdsFromModel(auth),
    });
  }

  private static async update(
    auth: Authenticator,
    sId: string,
    blob: Partial<InferAttributes<ConversationModel, { omit: "workspaceId" }>>,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    const conversation = await this.fetchById(auth, sId);
    if (conversation == null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    await conversation.update(blob, transaction);
    return new Ok(undefined);
  }

  static async listConversationsForUser(
    auth: Authenticator,
    options?: FetchConversationOptions
  ): Promise<ConversationWithoutContentType[]> {
    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const includedConversationVisibilities: ConversationVisibility[] = [
      "unlisted",
    ];

    if (options?.includeDeleted) {
      includedConversationVisibilities.push("deleted");
    }
    if (options?.includeTest) {
      includedConversationVisibilities.push("test");
    }

    const participations = await ConversationParticipantModel.findAll({
      attributes: ["userId", "updatedAt", "conversationId", "state"],
      where: {
        userId: user.id,
        workspaceId: owner.id,
        action: "posted",
      },
      include: [
        {
          model: ConversationModel,
          required: true,
          where: {
            visibility: { [Op.in]: includedConversationVisibilities },
          },
        },
      ],
      order: [["updatedAt", "DESC"]],
    });

    return participations.reduce((acc, p) => {
      const c = p.conversation;

      if (c) {
        acc.push({
          id: c.id,
          created: c.createdAt.getTime(),
          updated: p.updatedAt.getTime(),
          state: p.state,
          sId: c.sId,
          owner,
          title: c.title,
          visibility: c.visibility,
          depth: c.depth,
          requestedGroupIds: new this(
            this.model,
            c.get()
          ).getConversationRequestedGroupIdsFromModel(auth),
        });
      }

      return acc;
    }, [] as ConversationWithoutContentType[]);
  }

  static async upsertParticipation(
    auth: Authenticator,
    conversation: ConversationType
  ) {
    const user = auth.user();
    if (!user) {
      return;
    }

    await withTransaction(async (t) => {
      const participant = await ConversationParticipantModel.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          userId: user.id,
        },
        transaction: t,
      });

      if (participant) {
        participant.changed("updatedAt", true);
        await participant.update(
          {
            action: "posted",
            updatedAt: new Date(),
          },
          { transaction: t }
        );
      } else {
        await ConversationParticipantModel.create(
          {
            conversationId: conversation.id,
            action: "posted",
            userId: user.id,
            workspaceId: conversation.owner.id,
            state: "read",
          },
          { transaction: t }
        );
      }
    });
  }

  static async updateRequestedGroupIds(
    auth: Authenticator,
    sId: string,
    requestedGroupIds: number[][],
    transaction?: Transaction
  ) {
    const conversation = await ConversationResource.fetchById(auth, sId);
    if (conversation === null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    await conversation.updateRequestedGroupIds(requestedGroupIds, transaction);
    return new Ok(undefined);
  }

  static async updateTitle(
    auth: Authenticator,
    sId: string,
    title: string,
    transaction?: Transaction
  ) {
    return this.update(
      auth,
      sId,
      {
        title,
      },
      transaction
    );
  }

  static async fetchMCPServerViews(
    auth: Authenticator,
    conversation: ConversationWithoutContentType,
    onlyEnabled?: boolean
  ): Promise<ConversationMCPServerViewType[]> {
    const conversationMCPServerViews =
      await ConversationMCPServerViewModel.findAll({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          ...(onlyEnabled ? { enabled: true } : {}),
        },
      });

    return conversationMCPServerViews.map((view) => ({
      id: view.id,
      workspaceId: view.workspaceId,
      conversationId: view.conversationId,
      mcpServerViewId: view.mcpServerViewId,
      userId: view.userId,
      enabled: view.enabled,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    }));
  }

  static async upsertMCPServerViews(
    auth: Authenticator,
    {
      conversation,
      mcpServerViews,
      enabled,
    }: {
      conversation: ConversationWithoutContentType;
      mcpServerViews: MCPServerViewResource[];
      enabled: boolean;
    }
  ): Promise<Result<undefined, Error>> {
    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
    if (!featureFlags.includes("jit_tools")) {
      return new Err(new Error("JIT Tools are not enabled for this workspace"));
    }

    // For now we only allow MCP server views from the Company Space.
    // It's blocked in the UI but it's a last line of defense.
    // If we lift this limit, we should handle the requestedGroupIds on the conversation.
    if (
      mcpServerViews.some(
        (mcpServerViewResource) => mcpServerViewResource.space.kind !== "global"
      )
    ) {
      return new Err(
        new Error(
          "MCP server views are not part of the Company Space. It should not happen."
        )
      );
    }

    const existingConversationMCPServerViews = await this.fetchMCPServerViews(
      auth,
      conversation
    );

    // Cycle through the mcpServerViewIds and create or update the conversationMCPServerView
    for (const mcpServerView of mcpServerViews) {
      const existingConversationMCPServerView =
        existingConversationMCPServerViews.find(
          (view) => view.mcpServerViewId === mcpServerView.id
        );
      if (existingConversationMCPServerView) {
        await ConversationMCPServerViewModel.update(
          {
            enabled,
            userId: auth.getNonNullableUser().id,
            updatedAt: new Date(),
          },
          {
            where: {
              id: existingConversationMCPServerView.id,
              workspaceId: auth.getNonNullableWorkspace().id,
              conversationId: conversation.id,
            },
          }
        );
      } else {
        await ConversationMCPServerViewModel.create({
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          mcpServerViewId: mcpServerView.id,
          userId: auth.getNonNullableUser().id,
          enabled,
        });
      }
    }

    return new Ok(undefined);
  }

  async updateTitle(title: string) {
    return this.update({ title });
  }

  async updateVisibilityToDeleted() {
    return this.update({ visibility: "deleted" });
  }

  async updateVisibilityToUnlisted() {
    return this.update({ visibility: "unlisted" });
  }

  async updateRequestedGroupIds(
    requestedGroupIds: number[][],
    transaction?: Transaction
  ) {
    return this.update(
      {
        requestedGroupIds,
      },
      transaction
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    try {
      await ConversationMCPServerViewModel.destroy({
        where: { workspaceId: owner.id, conversationId: this.id },
        transaction,
      });
      await ConversationParticipantModel.destroy({
        where: { workspaceId: owner.id, conversationId: this.id },
        transaction,
      });
      await ConversationResource.model.destroy({
        where: {
          workspaceId: owner.id,
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  getConversationRequestedGroupIdsFromModel(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace();
    return this.requestedGroupIds.map((groups) =>
      groups.map((g) =>
        GroupResource.modelIdToSId({
          id: g,
          workspaceId: workspace.id,
        })
      )
    );
  }
}
