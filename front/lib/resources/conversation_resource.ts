import assert from "assert";
import uniq from "lodash/uniq";
import type {
  Attributes,
  CreationAttributes,
  InferAttributes,
  Transaction,
  WhereOptions,
} from "sequelize";
import { col, fn, literal, Op, QueryTypes, Sequelize, where } from "sequelize";

import { getMaximalVersionAgentStepContent } from "@app/lib/api/assistant/configuration/steps";
import type { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  ConversationModel,
  ConversationParticipantModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  createResourcePermissionsFromSpacesWithMap,
  createSpaceIdToGroupsMap,
} from "@app/lib/resources/permission_utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  ConversationMCPServerViewType,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  ModelId,
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationResource
  extends ReadonlyAttributesType<ConversationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationResource extends BaseResource<ConversationModel> {
  static model: ModelStaticWorkspaceAware<ConversationModel> =
    ConversationModel;

  // User-specific participation fields (populated when conversations are listed for a user).
  private userParticipation?: UserParticipation;
  constructor(
    model: ModelStaticWorkspaceAware<ConversationModel>,
    blob: Attributes<ConversationModel>,
    private readonly _space: SpaceResource | null
  ) {
    super(ConversationModel, blob);
  }

  get space(): SpaceResource | null {
    if (this.spaceId && !this._space) {
      throw new Error(
        "This conversation is associated with a space but the related space is not loaded. Action: make sure to load the space when fetching the conversation."
      );
    }
    return this._space;
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<ConversationModel>, "workspaceId">,
    space: SpaceResource | null
  ): Promise<ConversationResource> {
    const workspace = auth.getNonNullableWorkspace();

    // Check if the user has access to the space.
    // Note, using canRead because spaces members do not have write access to the space as write is tied with datasources.
    if (space && !space.canRead(auth)) {
      throw new Error(
        "Cannot create conversation in a space you do not have access to."
      );
    }

    // Check if the space match the workspace.
    if (space && space.workspaceId !== workspace.id) {
      throw new Error(
        "Cannot create conversation in a space that does not belong to the workspace."
      );
    }

    const conversation = await this.model.create({
      ...blob,
      workspaceId: workspace.id,
    });

    return new ConversationResource(
      ConversationResource.model,
      conversation.get(),
      space
    );
  }

  static async countForWorkspace(
    auth: Authenticator,
    options?: FetchConversationOptions
  ): Promise<number> {
    const workspace = auth.getNonNullableWorkspace();
    const { where } = this.getOptions(options);

    return this.model.count({
      where: {
        ...where,
        workspaceId: workspace.id,
      },
    });
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

    const uniqueSpaceIds = uniq([
      // Include requestedSpaceIds from conversations.
      ...conversations.flatMap((c) => c.requestedSpaceIds),

      // Include spaceId of the conversations if it exists.
      ...conversations.flatMap((c) => c.spaceId ?? []),
    ]);

    // Only fetch spaces if there are any used spaces.
    const spaces =
      uniqueSpaceIds.length === 0
        ? []
        : await SpaceResource.fetchByModelIds(auth, uniqueSpaceIds);

    const spaceIdToSpaceMap = new Map(spaces.map((s) => [s.id, s]));

    if (fetchConversationOptions?.dangerouslySkipPermissionFiltering) {
      return conversations.map(
        (c) =>
          new this(
            this.model,
            c.get(),
            c.spaceId ? (spaceIdToSpaceMap.get(c.spaceId) ?? null) : null
          )
      );
    }

    // Filter out conversations that reference missing/deleted spaces.
    // There are two reasons why a space may be missing here:
    // 1. When a space is deleted, conversations referencing it won't be deleted but should not be accessible.
    // 2. When a space belongs to another workspace (should not happen), conversations referencing it won't be accessible.

    // Note from seb, for Space Conversations, we probably want to be more subtle about the conversation accessible logic.
    // We should probably only filter out conversations where the spaceId is deleted but keep the one that referenced a deleted space.
    const foundSpaceIds = new Set(spaces.map((s) => s.id));
    const validConversations = conversations
      .filter((c) =>
        c.requestedSpaceIds.every((id) => foundSpaceIds.has(Number(id)))
      )
      .map(
        (c) =>
          new this(
            this.model,
            c.get(),
            c.spaceId ? (spaceIdToSpaceMap.get(c.spaceId) ?? null) : null
          )
      );

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

  get triggerSId(): string | null {
    return ConversationResource.triggerIdToSId(
      this.triggerId,
      this.workspaceId
    );
  }

  static async fetchParticipationMapForUser(
    auth: Authenticator,
    conversationIds?: number[]
  ): Promise<Map<number, UserParticipation>> {
    const user = auth.user();

    assert(user, "User is expected to be authenticated");

    const whereClause: WhereOptions<ConversationParticipantModel> = {
      userId: user.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    };

    if (conversationIds && conversationIds.length > 0) {
      whereClause.conversationId = { [Op.in]: conversationIds };
    }

    const participations = await ConversationParticipantModel.findAll({
      where: whereClause,
      attributes: [
        "actionRequired",
        "conversationId",
        "unread",
        "updatedAt",
        "userId",
      ],
    });

    return new Map(
      participations.map((p) => [
        p.conversationId,
        {
          actionRequired: p.actionRequired,
          unread: p.unread,
          updated: p.updatedAt.getTime(),
        },
      ])
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

  static async canAccess(
    auth: Authenticator,
    sId: string
  ): Promise<
    "allowed" | "conversation_not_found" | "conversation_access_restricted"
  > {
    const workspace = auth.getNonNullableWorkspace();
    const { where } = this.getOptions();
    const conversation = await this.model.findOne({
      where: {
        sId,
        workspaceId: workspace.id,
        ...where,
      },
    });
    if (!conversation) {
      return "conversation_not_found";
    }
    const spaces = await SpaceResource.fetchByModelIds(
      auth,
      conversation.requestedSpaceIds
    );
    try {
      const spaceIdToGroupsMap = createSpaceIdToGroupsMap(auth, spaces);
      if (
        !auth.canRead(
          createResourcePermissionsFromSpacesWithMap(
            spaceIdToGroupsMap,
            conversation.requestedSpaceIds.map((id) => Number(id))
          )
        )
      ) {
        return "conversation_access_restricted";
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return "conversation_not_found";
    }
    return "allowed";
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
          model: MessageModel,
          required: true,
          attributes: [],
          include: [
            {
              model: MentionModel,
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
              model: UserMessageModel,
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

    const inactiveConversations = await MessageModel.findAll({
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
    const messageWithAgent = await MessageModel.findAll({
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
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          attributes: [],
          where: {
            workspaceId,
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
      updated: conversation.updatedAt.getTime(),
      sId: conversation.sId,
      title: conversation.title,
      triggerId: conversation.triggerSId,
      actionRequired,
      unread,
      hasError: conversation.hasError,
      requestedGroupIds: [],
      requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
      spaceId: conversation.space?.sId ?? null,
      depth: conversation.depth,
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
    // First get all participations for the user to get conversation IDs and metadata.
    const participationMap = await this.fetchParticipationMapForUser(auth);
    const conversationIds = Array.from(participationMap.keys());

    if (conversationIds.length === 0) {
      return [];
    }

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
          updated: c.updatedAt.getTime(),
          sId: c.sId,
          title: c.title,
          triggerId: triggerId,
          actionRequired,
          unread,
          hasError: c.hasError,
          requestedGroupIds: [],
          requestedSpaceIds: c.getRequestedSpaceIdsFromModel(),
          spaceId: c.space?.sId ?? null,
          depth: c.depth,
        };
      })
    );
  }

  static async markAsActionRequired(
    auth: Authenticator,
    { conversation }: { conversation: ConversationWithoutContentType }
  ) {
    const user = auth.user();
    if (!user) {
      // If no user is authenticated, we cannot mark action required.
      return new Ok([0]);
    }

    // Update the conversation participant to set actionRequired to true
    const updated = await ConversationParticipantModel.update(
      { actionRequired: true },
      {
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user.id,
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

  static async markAsUpdated(
    auth: Authenticator,
    {
      conversation,
      t,
    }: { conversation: ConversationWithoutContentType; t?: Transaction }
  ): Promise<Result<number, Error>> {
    const updated = await ConversationModel.update(
      {
        id: col("id"), // no real change
      },
      {
        where: {
          id: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction: t,
      }
    );

    return new Ok(updated[0]);
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
          unread: false,
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

  getUserParticipation(): UserParticipation | undefined {
    return this.userParticipation;
  }

  static async upsertParticipation(
    auth: Authenticator,
    {
      conversation,
      action,
      user,
    }: {
      conversation: ConversationWithoutContentType;
      action: ParticipantActionType;
      user: UserType | null;
    }
  ): Promise<"added" | "updated" | "none"> {
    if (!user) {
      return "none";
    }

    let status: "added" | "updated" | "none" = "none";

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
        // If the action is subscribed, we do not update the participant at all.
        if (action === "subscribed") {
          status = "none";
          return;
        }

        participant.changed("updatedAt", true);
        await participant.update(
          {
            action,
            updatedAt: new Date(),
          },
          { transaction: t }
        );
        status = "updated";
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
        status = "added";
      }
    });

    return status;
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

  async getMessageById(
    auth: Authenticator,
    messageId: string
  ): Promise<Result<MessageModel, Error>> {
    const message = await MessageModel.findOne({
      where: {
        conversationId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: messageId,
      },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: false,
        },
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: false,
        },
      ],
    });

    if (!message) {
      return new Err(new Error("Message not found"));
    }

    return new Ok(message);
  }

  /**
   * This function retrieves the latest version of each message for the current page,
   * because there's no easy way to fetch only the latest version of a message.
   * Content fragment messages are not counted toward the limit.
   * It's sort by rank in descending order.
   */
  private async getMaxRankMessages(
    auth: Authenticator,
    { limit, lastRank }: { limit: number; lastRank?: number | null }
  ): Promise<{
    allMessageIds: ModelId[];
    hasMore: boolean;
  }> {
    // Step 1: Fetch all NON content fragments with size = limit + 1
    const whereNonCf: WhereOptions<MessageModel> = {
      conversationId: this.id,
      workspaceId: auth.getNonNullableWorkspace().id,
      contentFragmentId: { [Op.is]: null },
    };

    if (lastRank !== null && lastRank !== undefined) {
      whereNonCf["rank"] = {
        [Op.lt]: lastRank,
      };
    }

    const nonContentFragmentMessages = await MessageModel.findAll({
      attributes: [
        [Sequelize.fn("MAX", Sequelize.col("version")), "maxVersion"],
        [Sequelize.fn("MAX", Sequelize.col("id")), "id"],
        [Sequelize.fn("MAX", Sequelize.col("rank")), "rank"],
      ],
      where: whereNonCf,
      group: ["rank"],
      order: [["rank", "DESC"]],
      limit: limit + 1,
    });

    const nonContentFragmentMessageIds = nonContentFragmentMessages.map(
      (m) => m.id
    );
    const hasMore = nonContentFragmentMessageIds.length > limit;

    // Determine the rank range for content fragments
    // We include CFs where rank is between minRank and maxRank (inclusive)
    // This includes CFs that come between the lowest and highest ranked non-CF messages
    // Use ALL nonContentFragmentMessages (including the extra one) to determine the range
    let minRank: number | undefined;
    let maxRank: number | undefined;
    let ranksHaveGaps: boolean = false;
    if (nonContentFragmentMessages.length > 0) {
      const ranks = nonContentFragmentMessages.map((m) => m.rank);
      minRank = !hasMore ? 0 : Math.min(...ranks);
      maxRank = Math.max(...ranks);

      // Ranks must be contiguous, otherwise we have gaps so we must have the right amount of messages between the min and max rank.
      ranksHaveGaps =
        maxRank - minRank !== nonContentFragmentMessages.length - 1;
    }

    const allMessageIds: ModelId[] = hasMore
      ? nonContentFragmentMessageIds.slice(0, limit)
      : nonContentFragmentMessageIds;

    // Step 2: Fetch content fragments where rank is between minRank and maxRank
    // For single non-CF message: include CFs that come after it (rank < maxRank in DESC order)
    // For multiple non-CF messages: include CFs between minRank and maxRank (inclusive)

    if (minRank !== undefined && maxRank !== undefined && ranksHaveGaps) {
      const whereCf: WhereOptions<MessageModel> = {
        conversationId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        contentFragmentId: { [Op.ne]: null },
        rank: { [Op.between]: [minRank, maxRank] },
      };

      const contentFragmentMessages = await MessageModel.findAll({
        attributes: [
          [Sequelize.fn("MAX", Sequelize.col("version")), "maxVersion"],
          [Sequelize.fn("MAX", Sequelize.col("id")), "id"],
          [Sequelize.fn("MAX", Sequelize.col("rank")), "rank"],
        ],
        where: whereCf,
        group: ["rank"],
        order: [["rank", "DESC"]],
      });

      const cfMessageIds = contentFragmentMessages.map((m) => m.id);
      allMessageIds.push(...cfMessageIds);
    }

    return {
      allMessageIds,
      hasMore,
    };
  }

  async fetchMessagesForPage(
    auth: Authenticator,
    { limit, lastRank }: { limit: number; lastRank?: number | null }
  ): Promise<{ hasMore: boolean; messages: MessageModel[] }> {
    const { allMessageIds, hasMore } = await this.getMaxRankMessages(auth, {
      limit,
      lastRank,
    });

    // Fetch all messages (including content fragments and up to limit non-content-fragment messages)
    const messages = await MessageModel.findAll({
      where: {
        conversationId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        id: {
          [Op.in]: allMessageIds,
        },
      },
      order: [["rank", "DESC"]],
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: false,
        },
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: false,
          include: [
            {
              model: AgentStepContentModel,
              as: "agentStepContents",
              required: false,
            },
          ],
        },
        // We skip ContentFragmentResource here for efficiency reasons (retrieving contentFragments
        // along with messages in one query). Only once we move to a MessageResource will we be able
        // to properly abstract this.
        {
          model: ContentFragmentModel,
          as: "contentFragment",
          required: false,
        },
      ],
    });

    // Filter to only keep the step content with the maximum version for each step and index combination.
    for (const message of messages) {
      if (message.agentMessage && message.agentMessage.agentStepContents) {
        message.agentMessage.agentStepContents =
          getMaximalVersionAgentStepContent(
            message.agentMessage.agentStepContents
          );
      }
    }

    return {
      hasMore,
      messages,
    };
  }

  static async updateRequirements(
    auth: Authenticator,
    sId: string,
    requestedSpaceIds: number[],
    transaction?: Transaction
  ) {
    const conversation = await ConversationResource.fetchById(auth, sId);
    if (conversation === null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    await conversation.updateRequirements(requestedSpaceIds, transaction);
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
    // If we lift this limit, we should handle the requestedSpaceIds on the conversation.
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

  async updateRequirements(
    requestedSpaceIds: number[],
    transaction?: Transaction
  ) {
    return this.update(
      {
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

  async listParticipants(
    auth: Authenticator,
    unreadOnly: boolean = false
  ): Promise<(UserType & { unread: boolean })[]> {
    const participants = await ConversationParticipantModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: this.id,
        ...(unreadOnly ? { unread: true } : {}),
      },
    });

    const unreadMap = new Map<number, boolean>();
    for (const participant of participants) {
      unreadMap.set(participant.userId, participant.unread);
    }

    const userResources = await UserResource.fetchByModelIds(
      participants.map((p) => p.userId)
    );

    return userResources.map((userResource) => ({
      ...userResource.toJSON(),
      unread: unreadMap.get(userResource.id) ?? false,
    }));
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

  getRequestedSpaceIdsFromModel() {
    const spaceIds = this.requestedSpaceIds.map((id) =>
      SpaceResource.modelIdToSId({
        id,
        workspaceId: this.workspaceId,
      })
    );

    // Add the main space (if any).
    if (this.space) {
      spaceIds.push(this.space.sId);
    }

    return spaceIds;
  }

  static async batchMarkAsReadAndClearActionRequired(
    auth: Authenticator,
    conversationSIds: string[]
  ) {
    const conversations = await ConversationResource.fetchByIds(
      auth,
      conversationSIds
    );

    const conversationIds = conversations.map((c) => c.id);

    await ConversationParticipantModel.update(
      { unread: false, actionRequired: false },
      {
        where: {
          conversationId: { [Op.in]: conversationIds },
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: auth.getNonNullableUser().id,
        },
      }
    );

    return new Ok(undefined);
  }

  toJSON(): ConversationWithoutContentType {
    // If conversation is fetched for a user, use the participation data.
    const participation = this.userParticipation ?? {
      actionRequired: false,
      unread: false,
    };

    return {
      actionRequired: participation.actionRequired,
      created: this.createdAt.getTime(),
      updated: this.updatedAt.getTime(),
      spaceId: this.space?.sId ?? null,
      hasError: this.hasError,
      id: this.id,
      // TODO(REQUESTED_SPACE_IDS 2025-10-24): Stop exposing this once all logic is centralized
      // in baseFetchWithAuthorization.
      requestedSpaceIds: this.getRequestedSpaceIdsFromModel(),
      sId: this.sId,
      title: this.title,
      unread: participation.unread,
      depth: this.depth,
    };
  }
}
