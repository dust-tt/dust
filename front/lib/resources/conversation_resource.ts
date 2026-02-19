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
  UserConversationReadsModel,
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
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ConversationMCPServerViewType,
  ConversationVisibility,
  ConversationWithoutContentType,
  ParticipantActionType,
} from "@app/types/assistant/conversation";
import { ConversationError } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { UserType } from "@app/types/user";
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

export type FetchConversationOptions = {
  includeDeleted?: boolean;
  excludeTest?: boolean; // Explicitly exclude test conversations
  dangerouslySkipPermissionFiltering?: boolean;
  updatedSince?: number; // Filter conversations updated after this timestamp (milliseconds)
};

interface UserParticipation {
  actionRequired: boolean;
  lastReadAt: Date | null;
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

    // Add spaceId to the requestedSpaceIds if it is not already part of the requestedSpaceIds.
    if (space && !blob.requestedSpaceIds.includes(space.id)) {
      blob.requestedSpaceIds.push(space.id);
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
    const where: WhereOptions<ConversationModel> = {};

    const excludedVisibilities: ConversationVisibility[] = [];

    if (!options?.includeDeleted) {
      excludedVisibilities.push("deleted");
    }

    // Test conversations are included by default. Use excludeTest to exclude them.
    if (options?.excludeTest) {
      excludedVisibilities.push("test");
    }

    if (excludedVisibilities.length > 0) {
      where.visibility = { [Op.notIn]: excludedVisibilities };
    }

    if (options?.updatedSince !== undefined) {
      where.updatedAt = { [Op.gte]: new Date(options.updatedSince) };
    }

    return {
      where,
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
      order: options.order,
    });

    const uniqueSpaceIds = uniq([
      // Include requestedSpaceIds from conversations.
      ...conversations.flatMap((c) => c.requestedSpaceIds),
    ]);

    // Only fetch spaces if there are any used spaces.
    const spaces =
      uniqueSpaceIds.length === 0
        ? []
        : await SpaceResource.fetchByModelIds(auth, uniqueSpaceIds, {
            includeDeleted: fetchConversationOptions?.includeDeleted,
          });

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
      .filter((c) => c.requestedSpaceIds.every((id) => foundSpaceIds.has(id)))
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
          c.requestedSpaceIds
        )
      )
    );

    return spaceBasedAccessible;
  }

  private static triggerModelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("trigger", {
      id,
      workspaceId,
    });
  }

  static triggerIdToSId(triggerId: number | null, workspaceId: number) {
    return triggerId != null
      ? ConversationResource.triggerModelIdToSId({ id: triggerId, workspaceId })
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
      attributes: ["actionRequired", "conversationId", "updatedAt"],
    });

    const conversationReads = await UserConversationReadsModel.findAll({
      where: {
        conversationId: {
          [Op.in]: participations.map((p) => p.conversationId),
        },
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user.id,
      },
    });

    const conversationReadMap = new Map<number, Date>(
      conversationReads.map((read) => [read.conversationId, read.lastReadAt])
    );

    return new Map(
      participations.map((p) => [
        p.conversationId,
        {
          actionRequired: p.actionRequired,
          lastReadAt: conversationReadMap.get(p.conversationId) ?? null,
          updated: p.updatedAt.getTime(),
        },
      ])
    );
  }

  static async fetchReadMapForUser(
    auth: Authenticator,
    conversationIds: number[]
  ): Promise<Map<number, Date>> {
    const whereClause: WhereOptions<UserConversationReadsModel> = {
      userId: auth.getNonNullableUser().id,
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId: { [Op.in]: conversationIds },
    };

    const conversationReads = await UserConversationReadsModel.findAll({
      where: whereClause,
      attributes: ["conversationId", "lastReadAt"],
    });

    return new Map(
      conversationReads.map((read) => [read.conversationId, read.lastReadAt])
    );
  }

  private static async enrichWithParticipation(
    auth: Authenticator,
    conversations: ConversationResource[]
  ): Promise<void> {
    if (conversations.length === 0 || !auth.user()) {
      return;
    }

    const conversationIds = conversations.map((c) => c.id);
    const participationMap = await this.fetchParticipationMapForUser(
      auth,
      conversationIds
    );

    conversations.forEach((c) => {
      const participation = participationMap.get(c.id);
      if (participation) {
        c.userParticipation = participation;
      }
    });
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
            conversation.requestedSpaceIds
          )
        )
      ) {
        return "conversation_access_restricted";
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
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
    cutoffDate: Date,
    options?: FetchConversationOptions & {
      batchSize?: number;
    }
  ): Promise<ConversationResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const { batchSize = 1000 } = options ?? {};

    // Step 1: Retrieve conversation IDs started before the cutoff date.
    // This pre-filters conversations so we don't scan all messages in the workspace.
    const conversationsStartedBeforeCutoff =
      await this.baseFetchWithAuthorization(auth, options, {
        where: {
          workspaceId,
          createdAt: { [Op.lt]: cutoffDate },
        },
      });

    if (conversationsStartedBeforeCutoff.length === 0) {
      return [];
    }

    const candidateConversationIds = conversationsStartedBeforeCutoff.map(
      (c) => c.id
    );

    // Step 2: Query messages in batches to find inactive conversations
    // (those with no messages after the cutoff date).
    const inactiveConversationIds: Set<number> = new Set();

    for (let i = 0; i < candidateConversationIds.length; i += batchSize) {
      const batchIds = candidateConversationIds.slice(i, i + batchSize);

      const inactiveInBatch = await MessageModel.findAll({
        attributes: [
          "conversationId",
          [fn("MAX", col("createdAt")), "lastMessageDate"],
        ],
        where: {
          workspaceId,
          conversationId: { [Op.in]: batchIds },
        },
        group: ["conversationId"],
        having: where(fn("MAX", col("createdAt")), "<", cutoffDate),
      });

      inactiveInBatch.forEach((m) =>
        inactiveConversationIds.add(m.conversationId)
      );
    }

    if (inactiveConversationIds.size === 0) {
      return [];
    }

    return conversationsStartedBeforeCutoff.filter((c) =>
      inactiveConversationIds.has(c.id)
    );
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

    const { actionRequired, lastReadAt } =
      await ConversationResource.getActionRequiredAndLastReadAtForUser(
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
      unread: lastReadAt === null || conversation.updatedAt > lastReadAt,
      lastReadMs: lastReadAt?.getTime() ?? null,
      hasError: conversation.hasError,
      requestedGroupIds: [],
      requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
      spaceId: conversation.space?.sId ?? null,
      depth: conversation.depth,
      metadata: conversation.metadata,
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

  static async listPrivateConversationsForUser(
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
          spaceId: { [Op.is]: null },
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

  private static async fetchPrivateConversationsPaginated(
    auth: Authenticator,
    {
      pagination,
      extraWhereClause,
    }: {
      pagination: {
        limit: number;
        lastValue?: string;
        orderDirection?: "asc" | "desc";
      };
      extraWhereClause?: WhereOptions<InferAttributes<ConversationModel>>;
    }
  ): Promise<{
    conversations: ConversationResource[];
    hasMore: boolean;
    lastValue: string | null;
  }> {
    const emptyResult = {
      conversations: [],
      hasMore: false,
      lastValue: null,
    };

    const participationMap = await this.fetchParticipationMapForUser(auth);
    const conversationIds = Array.from(participationMap.keys());

    if (conversationIds.length === 0) {
      return emptyResult;
    }

    const orderDirection = pagination.orderDirection ?? "desc";

    const whereClause: WhereOptions<InferAttributes<ConversationModel>> = {
      id: { [Op.in]: conversationIds },
      spaceId: { [Op.is]: null },
      visibility: { [Op.eq]: "unlisted" },
      ...extraWhereClause,
    };

    if (pagination.lastValue) {
      const timestampMs = parseInt(pagination.lastValue, 10);
      if (!Number.isNaN(timestampMs)) {
        const operator = orderDirection === "desc" ? Op.lt : Op.gt;
        whereClause.updatedAt = {
          [operator]: new Date(timestampMs),
        };
      }
    }

    const fetchLimit = pagination.limit + 1;

    const conversations = await this.baseFetchWithAuthorization(
      auth,
      {},
      {
        where: whereClause,
        order: [["updatedAt", orderDirection === "desc" ? "DESC" : "ASC"]],
        limit: fetchLimit,
      }
    );

    let hasMore = false;
    let resultConversations = conversations;

    if (conversations.length > pagination.limit) {
      hasMore = true;
      resultConversations = conversations.slice(0, pagination.limit);
    }

    resultConversations.forEach((c) => {
      const participation = participationMap.get(c.id);
      if (participation) {
        c.userParticipation = participation;
      }
    });

    const lastConversation =
      resultConversations[resultConversations.length - 1];
    const lastValue = lastConversation
      ? lastConversation.updatedAt.getTime().toString()
      : null;

    return {
      conversations: resultConversations,
      hasMore,
      lastValue,
    };
  }

  static async listPrivateConversationsForUserPaginated(
    auth: Authenticator,
    pagination: {
      limit: number;
      lastValue?: string;
      orderDirection?: "asc" | "desc";
    }
  ): Promise<{
    conversations: ConversationResource[];
    hasMore: boolean;
    lastValue: string | null;
  }> {
    return this.fetchPrivateConversationsPaginated(auth, { pagination });
  }

  static async listSpaceUnreadConversationsForUser(
    auth: Authenticator,
    spaceIds: number[]
  ): Promise<{
    unreadConversations: ConversationResource[];
    nonParticipantUnreadConversations: ConversationResource[];
  }> {
    if (spaceIds.length === 0) {
      return {
        unreadConversations: [],
        nonParticipantUnreadConversations: [],
      };
    }
    const conversations = await this.baseFetchWithAuthorization(
      auth,
      {},
      {
        where: {
          spaceId: { [Op.in]: spaceIds },
          visibility: { [Op.eq]: "unlisted" },
        },
      }
    );

    if (conversations.length === 0) {
      return { unreadConversations: [], nonParticipantUnreadConversations: [] };
    }

    const participationMap = await this.fetchParticipationMapForUser(
      auth,
      conversations.map((c) => c.id)
    );
    const conversationIds = new Set(Array.from(participationMap.keys()));

    const nonParticipantConversations = conversations.filter(
      (c) => !conversationIds.has(c.id)
    );

    if (
      conversationIds.size === 0 &&
      nonParticipantConversations.length === 0
    ) {
      return {
        unreadConversations: [],
        nonParticipantUnreadConversations: [],
      };
    }

    const readMap = await this.fetchReadMapForUser(
      auth,
      nonParticipantConversations.map((c) => c.id)
    );

    // Attach participation data to resources.
    conversations.forEach((c) => {
      const participation = participationMap.get(c.id);
      if (participation) {
        c.userParticipation = participation;
      }
    });

    // These conversations are used to display the unread count in the sidebar.
    // We do not count conversations the user does not participate in.
    const unreadConversations = conversations.filter((c) => {
      const participation = c.userParticipation;
      if (!participation) {
        return false;
      }
      if (participation.lastReadAt === null) {
        return true;
      }
      if (c.updatedAt > participation.lastReadAt) {
        return true;
      }
      return false;
    });

    const nonParticipantUnreadConversations =
      nonParticipantConversations.filter((c) => {
        const lastReadAt = readMap.get(c.id);
        if (!lastReadAt) {
          return true;
        }
        if (c.updatedAt > lastReadAt) {
          return true;
        }
        return false;
      });

    return { unreadConversations, nonParticipantUnreadConversations };
  }

  static async getSpaceUnreadConversationIds(
    auth: Authenticator,
    spaceId: number
  ): Promise<string[]> {
    const conversations = await this.baseFetchWithAuthorization(
      auth,
      {},
      {
        where: {
          spaceId: { [Op.eq]: spaceId },
          visibility: { [Op.eq]: "unlisted" },
        },
      }
    );

    if (conversations.length === 0) {
      return [];
    }

    const readMap = await this.fetchReadMapForUser(
      auth,
      conversations.map((c) => c.id)
    );

    if (readMap.size === 0) {
      return conversations.map((c) => c.sId);
    }

    const unreadConversations = conversations.filter((c) => {
      const lastReadAt = readMap.get(c.id);
      if (!lastReadAt) {
        return true;
      }
      if (c.updatedAt > lastReadAt) {
        return true;
      }
      return false;
    });

    return unreadConversations.map((c) => c.sId);
  }

  static async listConversationsInSpace(
    auth: Authenticator,
    {
      spaceId,
      options,
    }: {
      spaceId: string;
      options?: FetchConversationOptions;
    }
  ): Promise<ConversationResource[]> {
    // Convert space sId to model ID
    const spaceModelId = getResourceIdFromSId(spaceId);
    if (spaceModelId === null) {
      return [];
    }

    const conversations = await this.baseFetchWithAuthorization(auth, options, {
      where: {
        spaceId: spaceModelId,
      },
      order: [["updatedAt", "DESC"]],
    });

    await this.enrichWithParticipation(auth, conversations);

    return conversations;
  }

  static async listConversationsInSpacePaginated(
    auth: Authenticator,
    {
      spaceId,
      options,
      pagination,
    }: {
      spaceId: string;
      options?: FetchConversationOptions;
      pagination: {
        limit: number;
        lastValue?: string;
        orderDirection?: "asc" | "desc";
      };
    }
  ): Promise<{
    conversations: ConversationResource[];
    hasMore: boolean;
    lastValue: string | null;
  }> {
    const emptyResult = {
      conversations: [],
      hasMore: false,
      lastValue: null,
    };

    const spaceModelId = getResourceIdFromSId(spaceId);
    if (spaceModelId === null) {
      return emptyResult;
    }

    const orderDirection = pagination.orderDirection ?? "desc";

    const whereClause: WhereOptions<InferAttributes<ConversationModel>> = {
      spaceId: spaceModelId,
    };

    if (pagination.lastValue) {
      const timestampMs = parseInt(pagination.lastValue, 10);
      if (!Number.isNaN(timestampMs)) {
        const operator = orderDirection === "desc" ? Op.lt : Op.gt;
        whereClause.updatedAt = {
          [operator]: new Date(timestampMs),
        };
      }
    }

    // Fetch limit + 1 to determine if there are more results
    const fetchLimit = pagination.limit + 1;

    const conversations = await this.baseFetchWithAuthorization(auth, options, {
      where: whereClause,
      order: [["updatedAt", orderDirection === "desc" ? "DESC" : "ASC"]],
      limit: fetchLimit,
    });

    let hasMore = false;
    let resultConversations = conversations;

    if (conversations.length > pagination.limit) {
      hasMore = true;
      resultConversations = conversations.slice(0, pagination.limit);
    }

    await this.enrichWithParticipation(auth, resultConversations);

    const lastConversation =
      resultConversations[resultConversations.length - 1];
    const lastValue = lastConversation
      ? lastConversation.updatedAt.getTime().toString()
      : null;

    return {
      conversations: resultConversations,
      hasMore,
      lastValue,
    };
  }

  static async searchByTitlePaginated(
    auth: Authenticator,
    {
      query,
      pagination,
    }: {
      query: string;
      pagination: {
        limit: number;
        lastValue?: string;
        orderDirection?: "asc" | "desc";
      };
    }
  ): Promise<{
    conversations: ConversationResource[];
    hasMore: boolean;
    lastValue: string | null;
  }> {
    return this.fetchPrivateConversationsPaginated(auth, {
      pagination,
      extraWhereClause: {
        title: { [Op.iLike]: `%${query}%` },
      },
    });
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
        const { actionRequired, lastReadAt } =
          await ConversationResource.getActionRequiredAndLastReadAtForUser(
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
          unread: lastReadAt === null || c.updatedAt > lastReadAt,
          lastReadMs: lastReadAt?.getTime() ?? null,
          hasError: c.hasError,
          requestedGroupIds: [],
          requestedSpaceIds: c.getRequestedSpaceIdsFromModel(),
          spaceId: c.space?.sId ?? null,
          depth: c.depth,
          metadata: c.metadata,
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

  static async markAsReadForAuthUser(
    auth: Authenticator,
    {
      conversation,
      transaction,
    }: {
      conversation: ConversationWithoutContentType;
      transaction?: Transaction;
    }
  ) {
    if (!auth.user()) {
      return new Err(new Error("user_not_authenticated"));
    }
    const updated = await UserConversationReadsModel.upsert(
      {
        conversationId: conversation.id,
        userId: auth.getNonNullableUser().id,
        workspaceId: auth.getNonNullableWorkspace().id,
        lastReadAt: new Date(),
      },
      { transaction }
    );
    return new Ok(updated);
  }

  static async getActionRequiredAndLastReadAtForUser(
    auth: Authenticator,
    id: number
  ) {
    if (!auth.user()) {
      return {
        actionRequired: false,
        lastReadAt: null,
      };
    }

    const [participant, conversationRead] = await Promise.all([
      ConversationParticipantModel.findOne({
        where: {
          conversationId: id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: auth.getNonNullableUser().id,
        },
      }),
      UserConversationReadsModel.findOne({
        where: {
          conversationId: id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: auth.getNonNullableUser().id,
        },
      }),
    ]);

    return {
      actionRequired: participant?.actionRequired ?? false,
      lastReadAt: conversationRead?.lastReadAt ?? null,
    };
  }

  static async isConversationParticipant(
    auth: Authenticator,
    {
      conversation,
      user,
      transaction,
    }: {
      conversation: ConversationWithoutContentType;
      user: UserType;
      transaction?: Transaction;
    }
  ): Promise<boolean> {
    const count = await ConversationParticipantModel.count({
      where: {
        conversationId: conversation.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user.id,
      },
      transaction,
    });
    return count > 0;
  }

  static async upsertParticipation(
    auth: Authenticator,
    {
      conversation,
      action,
      user,
      transaction,
      lastReadAt = new Date(),
    }: {
      conversation: ConversationWithoutContentType;
      action: ParticipantActionType;
      user: UserType | null;
      transaction?: Transaction;
      lastReadAt?: Date | null;
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
            actionRequired: false,
          },
          { transaction: t }
        );
        status = "added";
      }

      if (lastReadAt) {
        await UserConversationReadsModel.upsert(
          {
            conversationId: conversation.id,
            userId: user.id,
            workspaceId: auth.getNonNullableWorkspace().id,
            lastReadAt,
          },
          { transaction: t }
        );
      }
    }, transaction);

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
            SELECT rank,
                   "agentMessageId",
                   version
            FROM (SELECT rank,
                         "agentMessageId",
                         version,
                         ROW_NUMBER() OVER (
            PARTITION BY rank
            ORDER BY version DESC
          ) as rn
                  FROM messages
                  WHERE "workspaceId" = :workspaceId
                    AND "conversationId" = :conversationId
                    AND "agentMessageId" IS NOT NULL) ranked_messages
            WHERE rn = 1
        `;

    // biome-ignore lint/plugin/noRawSql: automatic suppress
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
        visibility: { [Op.ne]: "deleted" },
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
    { onlyEnabled }: { onlyEnabled?: boolean } = {}
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
        requestedSpaceIds: uniq(requestedSpaceIds),
      },
      transaction
    );
  }

  async updateSpaceId(space: SpaceResource, transaction?: Transaction) {
    await this.update({ spaceId: space.id }, transaction);
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

  async isConversationCreator(
    auth: Authenticator
  ): Promise<Result<boolean, Error>> {
    const user = auth.user();
    if (!user) {
      return new Err(new Error("user_not_authenticated"));
    }

    // Get the first participant added to the conversation (the creator)
    const firstParticipant = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: this.id,
      },
      order: [["createdAt", "ASC"]],
    });

    if (!firstParticipant) {
      return new Err(new Error("No participants found for conversation"));
    }
    return new Ok(firstParticipant.userId === user.id);
  }

  async listParticipants(
    auth: Authenticator
  ): Promise<(UserType & { lastReadAt: Date | null })[]> {
    const participants = await ConversationParticipantModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: this.id,
      },
    });

    const conversationReads = await UserConversationReadsModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: { [Op.in]: participants.map((p) => p.userId) },
        conversationId: this.id,
      },
    });
    const lastReadAtMap = new Map<number, Date>(
      conversationReads.map((cr) => [cr.userId, cr.lastReadAt])
    );

    const userResources = await UserResource.fetchByModelIds(
      participants.map((p) => p.userId)
    );

    return userResources.map((userResource) => ({
      ...userResource.toJSON(),
      lastReadAt: lastReadAtMap.get(userResource.id) ?? null,
    }));
  }

  /**
   * Returns participant details (userId and action) ordered by createdAt ASC.
   * The first participant is considered the conversation creator.
   */
  static async listParticipantDetails(
    auth: Authenticator,
    conversation: ConversationWithoutContentType
  ): Promise<{ userId: ModelId; action: ParticipantActionType }[]> {
    const participants = await ConversationParticipantModel.findAll({
      where: {
        conversationId: conversation.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      attributes: ["userId", "action"],
      order: [["createdAt", "ASC"]],
    });

    return participants.map((p) => ({
      userId: p.userId,
      action: p.action,
    }));
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    try {
      await ConversationMCPServerViewModel.destroy({
        where: {
          workspaceId: owner.id,
          conversationId: this.id,
        },
        transaction,
      });
      await ConversationParticipantModel.destroy({
        where: {
          workspaceId: owner.id,
          conversationId: this.id,
        },
        transaction,
      });
      await UserConversationReadsModel.destroy({
        where: {
          workspaceId: owner.id,
          conversationId: this.id,
        },
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

    const userModelId = auth.getNonNullableUser().id;
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    await ConversationParticipantModel.update(
      { actionRequired: false },
      {
        where: {
          conversationId: { [Op.in]: conversationIds },
          workspaceId: workspaceModelId,
          userId: userModelId,
        },
      }
    );

    // Update the existing UserConversationReads entries
    const existingReads = await UserConversationReadsModel.findAll({
      where: {
        conversationId: { [Op.in]: conversationIds },
        userId: userModelId,
        workspaceId: workspaceModelId,
      },
    });

    await UserConversationReadsModel.update(
      { lastReadAt: new Date() },
      {
        where: {
          id: {
            [Op.in]: existingReads.map((read) => read.id),
          },
        },
      }
    );

    // Create entries for conversations that do not have one yet
    const conversationIdsWithExistingReads = new Set(
      existingReads.map((read) => read.conversationId)
    );
    const conversationIdsNeedingNewReads = conversationIds.filter(
      (id) => !conversationIdsWithExistingReads.has(id)
    );
    await UserConversationReadsModel.bulkCreate(
      conversationIdsNeedingNewReads.map((conversationId) => ({
        conversationId,
        userId: userModelId,
        workspaceId: workspaceModelId,
        lastReadAt: new Date(),
      }))
    );

    return new Ok(undefined);
  }

  /**
   * Removes all participants from a conversation.
   * Returns the number of participants removed.
   */
  async removeAllParticipants(auth: Authenticator): Promise<number> {
    return ConversationParticipantModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: this.id,
      },
    });
  }

  /**
   * Merges conversation participations from a secondary user into a primary user.
   * - Removes secondary user's participations in conversations where primary user already participates
   * - Updates remaining secondary user participations to point to primary user
   * Used during user account merging.
   */
  static async mergeUserParticipations(
    workspaceId: ModelId,
    {
      primaryUserId,
      secondaryUserId,
    }: {
      primaryUserId: ModelId;
      secondaryUserId: ModelId;
    }
  ): Promise<void> {
    // Find conversations where primary user is already a participant
    const primaryUserParticipations =
      await ConversationParticipantModel.findAll({
        where: {
          userId: primaryUserId,
          workspaceId,
        },
        attributes: ["conversationId"],
      });

    const primaryUserConversationIds = primaryUserParticipations.map(
      (p) => p.conversationId
    );

    // Delete secondary user's participations in conversations where primary user already participates
    if (primaryUserConversationIds.length > 0) {
      await ConversationParticipantModel.destroy({
        where: {
          userId: secondaryUserId,
          conversationId: primaryUserConversationIds,
          workspaceId,
        },
      });
    }

    // Update remaining secondary user participations to point to primary user
    await ConversationParticipantModel.update(
      { userId: primaryUserId },
      {
        where: {
          userId: secondaryUserId,
          workspaceId,
        },
      }
    );
  }

  toJSON(): ConversationWithoutContentType {
    // If conversation is fetched for a user, use the participation data.
    const participation = this.userParticipation ?? {
      actionRequired: false,
      lastReadAt: null,
    };

    return {
      actionRequired: participation.actionRequired,
      created: this.createdAt.getTime(),
      updated: this.updatedAt.getTime(),
      spaceId: this.space?.sId ?? null,
      triggerId: this.triggerSId,
      hasError: this.hasError,
      id: this.id,
      // TODO(REQUESTED_SPACE_IDS 2025-10-24): Stop exposing this once all logic is centralized
      // in baseFetchWithAuthorization.
      requestedSpaceIds: this.getRequestedSpaceIdsFromModel(),
      sId: this.sId,
      title: this.title,
      unread:
        participation.lastReadAt === null ||
        (!!this.updatedAt && this.updatedAt > participation.lastReadAt),
      lastReadMs: participation.lastReadAt?.getTime() ?? null,
      depth: this.depth,
      metadata: this.metadata,
    };
  }
}
