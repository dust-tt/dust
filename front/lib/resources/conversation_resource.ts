import type {
  CreationAttributes,
  InferAttributes,
  Transaction,
} from "sequelize";
import { col, fn, literal, Op, QueryTypes, Sequelize, where } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
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
import { GroupResource } from "@app/lib/resources/group_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  createResourcePermissionsFromSpacesWithMap,
  createSpaceIdToGroupsMap,
} from "@app/lib/resources/permission_utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  ConversationMCPServerViewType,
  ConversationType,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  ParticipantActionType,
  Result,
  UserType,
} from "@app/types";
import { ConversationError, Err, normalizeError, Ok } from "@app/types";

export type FetchConversationOptions = {
  includeDeleted?: boolean;
  includeTest?: boolean;
  dangerouslySkipPermissionFiltering?: boolean;
};

interface UserParticipation {
  actionRequired: boolean;
  unread: boolean;
  updated: number;
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationResource
  extends ReadonlyAttributesType<ConversationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationResource extends BaseResource<ConversationModel> {
  static model: ModelStaticWorkspaceAware<ConversationModel> =
    ConversationModel;

  // User-specific participation fields (populated when conversations are listed for a user).
  private userParticipation?: UserParticipation;

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

  private static async baseFetchWithAuthorization(
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

    const uniqueSpaceIds = Array.from(
      new Set(conversations.flatMap((c) => c.requestedSpaceIds))
    );

    // Only fetch spaces if there are any requestedSpaceIds.
    const spaces =
      uniqueSpaceIds.length === 0
        ? []
        : await SpaceResource.fetchByModelIds(auth, uniqueSpaceIds);

    if (fetchConversationOptions?.dangerouslySkipPermissionFiltering) {
      return conversations.map((c) => new this(this.model, c.get()));
    }

    // Filter out conversations that reference missing/deleted spaces.
    // There are two reasons why a space may be missing here:
    // 1. When a space is deleted, conversations referencing it won't be deleted but should not be accessible.
    // 2. When a space belongs to another workspace (should not happen), conversations referencing it won't be accessible.
    const foundSpaceIds = new Set(spaces.map((s) => s.id));
    const validConversations = conversations
      .filter((c) =>
        c.requestedSpaceIds.every((id) => foundSpaceIds.has(Number(id)))
      )
      .map((c) => new this(this.model, c.get()));

    // Create space-to-groups mapping once for efficient permission checks.
    const spaceIdToGroupsMap = createSpaceIdToGroupsMap(auth, spaces);

    const spaceBasedAccessible = validConversations.filter((c) =>
      auth.canRead(
        createResourcePermissionsFromSpacesWithMap(
          spaceIdToGroupsMap,
          // Parse as Number since Sequelize array of BigInts are returned as strings.
          c.requestedSpaceIds.map((id) => Number(id))
        )
      )
    );

    return spaceBasedAccessible;
  }

  static triggerIdToSId(triggerId: number | null, workspaceId: number) {
    return triggerId != null
      ? TriggerResource.modelIdToSId({ id: triggerId, workspaceId })
      : null;
  }

  triggerSId(): string | null {
    return ConversationResource.triggerIdToSId(
      this.triggerId,
      this.workspaceId
    );
  }

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[],
    options?: FetchConversationOptions
  ) {
    return this.baseFetchWithAuthorization(auth, options, {
      where: {
        sId: { [Op.in]: sIds },
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
    return this.baseFetchWithAuthorization(auth, options);
  }

  // TODO(2025-10-22 flav): Use baseFetchWithAuthorization.
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

  static async listAllBeforeDate(
    auth: Authenticator,
    options?: FetchConversationOptions & {
      batchSize?: number;
      cutoffDate: Date;
    }
  ): Promise<ConversationResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const { batchSize = 1000, cutoffDate } = options ?? {};

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
      const conversations = await this.baseFetchWithAuthorization(
        auth,
        options,
        {
          where: {
            id: {
              [Op.in]: batch.map((m) => m.conversationId),
            },
          },
        }
      );

      results.push(...conversations);
    }

    return results;
  }

  static async listConversationWithAgentCreatedBeforeDate(
    auth: Authenticator,
    {
      agentConfigurationId,
      cutoffDate,
    }: {
      agentConfigurationId: string;
      cutoffDate: Date;
    },
    options?: FetchConversationOptions
  ): Promise<string[]> {
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
    const conversations = await this.baseFetchWithAuthorization(auth, options, {
      where: {
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

  static async fetchConversationWithoutContent(
    auth: Authenticator,
    sId: string,
    options?: FetchConversationOptions & {
      dangerouslySkipPermissionFiltering?: boolean;
    }
  ): Promise<Result<ConversationWithoutContentType, ConversationError>> {
    const conversation = await this.fetchById(auth, sId, {
      includeDeleted: options?.includeDeleted,
      dangerouslySkipPermissionFiltering:
        options?.dangerouslySkipPermissionFiltering,
    });

    if (!conversation) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    const { actionRequired, unread } =
      await ConversationResource.getActionRequiredAndUnreadForUser(
        auth,
        conversation.id
      );

    return new Ok({
      id: conversation.id,
      created: conversation.createdAt.getTime(),
      sId: conversation.sId,
      title: conversation.title,
      triggerId: conversation.triggerSId(),
      actionRequired,
      unread,
      hasError: conversation.hasError,
      requestedGroupIds: conversation.getRequestedGroupIdsFromModel(auth),
      requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(auth),
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
    auth: Authenticator
  ): Promise<ConversationResource[]> {
    const user = auth.getNonNullableUser();

    // First get all participations for the user to get conversation IDs and metadata.
    const participations = await ConversationParticipantModel.findAll({
      attributes: [
        "actionRequired",
        "conversationId",
        "unread",
        "updatedAt",
        "userId",
      ],
      where: {
        userId: user.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      order: [["updatedAt", "DESC"]],
    });

    if (participations.length === 0) {
      return [];
    }

    const conversationIds = participations.map((p) => p.conversationId);

    // Use baseFetchWithAuthorization to get conversations with proper authorization.
    const conversations = await this.baseFetchWithAuthorization(
      auth,
      {},
      {
        where: {
          id: { [Op.in]: conversationIds },
          visibility: { [Op.eq]: "unlisted" },
        },
      }
    );

    const participationMap = new Map(
      participations.map((p) => [
        p.conversationId,
        {
          actionRequired: p.actionRequired,
          unread: p.unread,
          updated: p.updatedAt.getTime(),
        },
      ])
    );

    // Attach participation data to resources.
    conversations.forEach((c) => {
      const participation = participationMap.get(c.id);
      if (participation) {
        c.userParticipation = participation;
      }
    });

    // Sort by participation updated time descending.
    return conversations.sort(
      (a, b) =>
        (b.userParticipation?.updated ?? 0) -
        (a.userParticipation?.updated ?? 0)
    );
  }

  static async listConversationsForTrigger(
    auth: Authenticator,
    triggerId: string,
    options?: FetchConversationOptions
  ): Promise<ConversationWithoutContentType[]> {
    const triggerModelId = getResourceIdFromSId(triggerId);
    if (triggerModelId === null) {
      return [];
    }

    const conversations = await this.baseFetchWithAuthorization(auth, options, {
      where: {
        triggerId: triggerModelId,
      },
      order: [["createdAt", "DESC"]],
    });

    return Promise.all(
      conversations.map(async (c) => {
        const { actionRequired, unread } =
          await ConversationResource.getActionRequiredAndUnreadForUser(
            auth,
            c.id
          );

        return {
          id: c.id,
          created: c.createdAt.getTime(),
          sId: c.sId,
          title: c.title,
          triggerId: triggerId,
          actionRequired,
          unread,
          hasError: c.hasError,
          requestedGroupIds: c.getRequestedGroupIdsFromModel(auth),
          requestedSpaceIds: c.getRequestedSpaceIdsFromModel(auth),
        };
      })
    );
  }

  static async markAsActionRequired(
    auth: Authenticator,
    { conversation }: { conversation: ConversationWithoutContentType }
  ) {
    // Update the conversation participant to set actionRequired to true
    const updated = await ConversationParticipantModel.update(
      { actionRequired: true },
      {
        // We do not have a workspaceId here because we do not have an Authenticator in the caller.
        // It's fine because we are only updating the actionRequired flag.
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );

    return new Ok(updated);
  }

  static async clearActionRequired(
    auth: Authenticator,
    conversationId: string
  ) {
    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (conversation === null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    const updated = await ConversationParticipantModel.update(
      { actionRequired: false },
      {
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        // Do not update `updatedAt.
        silent: true,
      }
    );

    return new Ok(updated);
  }

  static async markAsUnreadForOtherParticipants(
    auth: Authenticator,
    {
      conversation,
      excludedUser,
    }: {
      conversation: ConversationWithoutContentType;
      excludedUser?: UserType;
    }
  ) {
    const updated = await ConversationParticipantModel.update(
      { unread: true },
      {
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          ...(excludedUser ? { userId: { [Op.ne]: excludedUser.id } } : {}),
        },
      }
    );
    return new Ok(updated);
  }

  static async markAsRead(
    auth: Authenticator,
    { conversation }: { conversation: ConversationWithoutContentType }
  ) {
    if (!auth.user()) {
      return new Err(new Error("user_not_authenticated"));
    }

    const updated = await ConversationParticipantModel.update(
      { unread: false },
      {
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: auth.getNonNullableUser().id,
        },
        // Do not update `updatedAt.
        silent: true,
      }
    );
    return new Ok(updated);
  }

  static async getActionRequiredAndUnreadForUser(
    auth: Authenticator,
    id: number
  ) {
    if (!auth.user()) {
      return {
        actionRequired: false,
        unread: false,
      };
    }

    const participant = await ConversationParticipantModel.findOne({
      where: {
        conversationId: id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
      },
    });

    return {
      actionRequired: participant?.actionRequired ?? false,
      unread: participant?.unread ?? false,
    };
  }

  static async upsertParticipation(
    auth: Authenticator,
    {
      conversation,
      action,
    }: {
      conversation: ConversationWithoutContentType | ConversationType;
      action: ParticipantActionType;
    }
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
            action,
            updatedAt: new Date(),
          },
          { transaction: t }
        );
      } else {
        await ConversationParticipantModel.create(
          {
            conversationId: conversation.id,
            action,
            userId: user.id,
            workspaceId: auth.getNonNullableWorkspace().id,
            unread: false,
            actionRequired: false,
          },
          { transaction: t }
        );
      }
    });
  }

  /**
   * Get the latest agent message id by rank for a given conversation.
   * @returns The latest agent message id, version and rank.
   */
  async getLatestAgentMessageIdByRank(auth: Authenticator): Promise<
    {
      rank: number;
      agentMessageId: number;
      version: number;
    }[]
  > {
    const query = `
        SELECT
        rank,
        "agentMessageId",
        version
      FROM (
        SELECT
          rank,
          "agentMessageId",
          version,
          ROW_NUMBER() OVER (
            PARTITION BY rank
            ORDER BY version DESC
          ) as rn
        FROM messages
        WHERE
          "workspaceId" = :workspaceId
          AND "conversationId" = :conversationId
          AND "agentMessageId" IS NOT NULL
      ) ranked_messages
      WHERE rn = 1
  `;

    // eslint-disable-next-line dust/no-raw-sql
    const results = await frontSequelize.query<{
      rank: number;
      agentMessageId: number;
      version: number;
    }>(query, {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: this.id,
      },
    });

    return results;
  }

  // TODO(2025-10-17 thomas): Rename and remove requestedGroupIds
  static async updateRequestedGroupIds(
    auth: Authenticator,
    sId: string,
    requestedGroupIds: number[][],
    requestedSpaceIds: number[],
    transaction?: Transaction
  ) {
    const conversation = await ConversationResource.fetchById(auth, sId);
    if (conversation === null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    await conversation.updateRequestedGroupIds(
      requestedGroupIds,
      requestedSpaceIds,
      transaction
    );
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

  // TODO(2025-10-17 thomas): Rename and remove requestedGroupIds
  async updateRequestedGroupIds(
    requestedGroupIds: number[][],
    requestedSpaceIds: number[],
    transaction?: Transaction
  ) {
    return this.update(
      {
        requestedGroupIds,
        requestedSpaceIds,
      },
      transaction
    );
  }

  static async markHasError(
    auth: Authenticator,
    { conversation }: { conversation: ConversationWithoutContentType },
    transaction?: Transaction
  ) {
    return this.model.update(
      {
        hasError: true,
      },
      {
        where: {
          id: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      }
    );
  }

  static async clearHasError(
    auth: Authenticator,
    { conversation }: { conversation: ConversationWithoutContentType },
    transaction?: Transaction
  ) {
    return this.model.update(
      {
        hasError: false,
      },
      {
        where: {
          id: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      }
    );
  }

  async leaveConversation(
    auth: Authenticator
  ): Promise<Result<{ wasLastMember: boolean; affectedCount: number }, Error>> {
    const user = auth.user();
    if (!user) {
      return new Err(new Error("user_not_authenticated"));
    }
    const remaining = await ConversationParticipantModel.count({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: this.id,
      },
    });

    let affectedCount = 0;
    if (remaining > 1) {
      affectedCount = await ConversationParticipantModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: this.id,
          userId: user.id,
        },
      });
    }

    return new Ok({ wasLastMember: remaining <= 1, affectedCount });
  }

  async isConversationParticipant(user: UserResource): Promise<boolean> {
    const count = await ConversationParticipantModel.count({
      where: {
        conversationId: this.id,
        userId: user.id,
        workspaceId: this.workspaceId,
      },
    });

    return count > 0;
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

  getRequestedGroupIdsFromModel(auth: Authenticator) {
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

  getRequestedSpaceIdsFromModel(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace();

    return this.requestedSpaceIds.map((id) =>
      SpaceResource.modelIdToSId({
        id,
        workspaceId: workspace.id,
      })
    );
  }

  toJSON(): ConversationWithoutContentType {
    // If conversation is fetched for a user, use the participation data.
    const participation = this.userParticipation ?? {
      actionRequired: false,
      unread: false,
      updated: this.updatedAt.getTime(),
    };

    return {
      actionRequired: participation.actionRequired,
      created: this.createdAt.getTime(),
      hasError: this.hasError,
      id: this.id,
      // TODO(REQUESTED_SPACE_IDS 2025-10-24): Stop exposing this once all logic is centralized
      // in baseFetchWithAuthorization.
      requestedGroupIds: this.requestedGroupIds.map((groups) =>
        groups.map((g) =>
          GroupResource.modelIdToSId({
            id: g,
            workspaceId: this.workspaceId,
          })
        )
      ),
      requestedSpaceIds: this.requestedSpaceIds.map((id) =>
        SpaceResource.modelIdToSId({
          id,
          workspaceId: this.workspaceId,
        })
      ),
      sId: this.sId,
      title: this.title,
      unread: participation.unread,
      updated: participation.updated,
    };
  }
}
