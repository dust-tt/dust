import { MAX_CONVERSATION_DEPTH } from "@app/lib/api/assistant/conversation/constants";
import type { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import {
  AgentMessageModel,
  CompactionMessageModel,
  ConversationModel,
  ConversationParticipantModel,
  MentionModel,
  MessageModel,
  UserConversationReadsModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";

import { ConversationForkModel } from "@app/lib/models/agent/conversation_fork";
import { REINFORCED_SKILLS_METADATA_KEYS } from "@app/lib/reinforcement/types";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { canReadRequestedSpaces } from "@app/lib/resources/permission_utils";
import { RunResource } from "@app/lib/resources/run_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WakeUpModel } from "@app/lib/resources/storage/models/wakeup";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { getNextWakeUpFireAtFromScheduleConfig } from "@app/lib/utils/wakeup_description";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageStatus,
  CompactionMessageStatus,
  ConversationForkedChildType,
  ConversationForkedFromType,
  ConversationForkingDataType,
  ConversationListItemType,
  ConversationMCPServerViewType,
  ConversationMetadata,
  ConversationUrlAccessMode,
  ConversationVisibility,
  ConversationWithoutContentType,
  ParticipantActionType,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import {
  ACTIVATION_NUDGE_ORIGIN,
  ConversationError,
  getConversationDisplayTitle,
  getConversationUrlAccessMode,
} from "@app/types/assistant/conversation";
import type { ModelResolutionMethodType } from "@app/types/assistant/models/types";
import type { WakeUpScheduleConfig } from "@app/types/assistant/wakeups";
import { ACTIVE_WAKE_UP_STATUSES } from "@app/types/assistant/wakeups";
import type { ContentFragmentVersion } from "@app/types/content_fragment";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import assert from "assert";
import uniq from "lodash/uniq";
import type {
  Attributes,
  CreationAttributes,
  InferAttributes,
  Order,
  Transaction,
  WhereOptions,
} from "sequelize";
import { col, fn, literal, Op, QueryTypes, Sequelize, where } from "sequelize";

type FetchConversationOptions = {
  includeDeleted?: boolean;
  excludeTest?: boolean; // Explicitly exclude test conversations
  onlyRootConversations?: boolean; // Exclude sub-conversations (depth > 0)
  dangerouslySkipPermissionFiltering?: boolean;
  includeForkingData?: boolean;
  updatedSince?: number; // Filter conversations updated after this timestamp (milliseconds)
  // Read within the given transaction, seeing its uncommitted writes. Only honored on the
  // `baseFetchWithAuthorization` path (`fetchById`, `fetchByIds`, `listAll`, ...). Helpers that
  // cherry-pick options, such as `fetchConversationWithParticipantState`, still read outside of it.
  transaction?: Transaction;
};

type SpaceConversationsFilter = "all" | "group" | "with_me";

export const AGENT_CONVERSATIONS_ORDER_COLUMNS = {
  createdAt: `c."createdAt"`,
  title: `c."title"`,
  sId: `c."sId"`,
} as const;

export type AgentConversationsOrderColumn =
  keyof typeof AGENT_CONVERSATIONS_ORDER_COLUMNS;

interface UserParticipation {
  actionRequired: boolean;
  updated: number;
}

export type ConversationAccessType =
  | "allowed"
  | "conversation_not_found"
  | "conversation_access_restricted"
  | "conversation_access_restricted_by_private_by_default_url_restriction";

export type RunningAgentMessageContext = {
  sId: string;
  agentMessageId: number;
  agentConfigurationId: string;
  rank: number;
};

export type AgentMessageConsumptionAnalyticsContext = {
  agentMessage: {
    agentConfigurationId: string;
    agentConfigurationVersion: number;
    completedAt: Date | null;
    costCredits: number | null;
    agentMessageModelId: ModelId;
    modelResolutionMethod: ModelResolutionMethodType | null;
    resolvedModelId: string | null;
    resolvedProviderId: string | null;
    resolvedReasoningEffort: string | null;
    runIds: string[] | null;
    status: AgentMessageStatus;
    version: number;
  };
  conversation: {
    depth: number;
    conversationId: string;
    spaceModelId: ModelId | null;
    triggerModelId: ModelId | null;
  };
  triggeringUserMessage: {
    agenticOriginMessageId: string | null;
    apiKeyModelId: ModelId | null;
    origin: UserMessageOrigin;
    userId: string | null;
  };
};

type RunningCompactionMessageContext = {
  sId: string;
  rank: number;
};

type BranchCreationContext = {
  isEmpty: boolean;
  onlyContentFragments: boolean;
  maxRank: number | null;
  lastMessage: { id: ModelId; rank: number } | null;
};

type LatestMessageSummary = {
  sId: string;
  rank: number;
  compactionStatus: CompactionMessageStatus | null;
};

const shouldByPassPrivateByDefaultUrlRestriction = (auth: Authenticator) => {
  // Dust super users (poke admins) can always access conversations regardless of participant
  // restrictions — they need this to debug triggered conversations that have no human participant.
  if (auth.isDustSuperUser()) {
    return true;
  }
  const authMethod = auth.authMethod();
  switch (authMethod) {
    case "api_key":
    case "system_api_key":
    case "internal":
      // Support api key and internalAdminForWorkspace auth methods.
      return true;
    case "oauth":
    case "session":
    case "sandbox_token":
      return false;
    default:
      assertNever(authMethod);
  }
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationResource
  extends ReadonlyAttributesType<ConversationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationResource extends BaseResource<ConversationModel> {
  static model: ModelStaticWorkspaceAware<ConversationModel> =
    ConversationModel;

  // User-specific fields (populated when conversations are listed for a user).
  private userParticipation?: UserParticipation;
  private userLastReadAt: Date | null = null;
  private nextWakeupAt: number | null = null;
  private _forkingData?: ConversationForkingDataType;

  constructor(
    model: ModelStaticWorkspaceAware<ConversationModel>,
    blob: Attributes<ConversationModel>,
    private _space: SpaceResource | null
  ) {
    super(ConversationModel, blob);
  }

  private static getForkedFromInclude() {
    return [
      {
        association: "forkedFrom" as const,
        required: false,
        attributes: ["branchedAt", "childConversationId", "fileCopyStatus"],
        include: [
          {
            association: "parentConversation" as const,
            required: true,
            attributes: ["sId", "title"],
          },
          {
            association: "sourceMessage" as const,
            required: true,
            attributes: ["sId"],
          },
          {
            association: "createdByUser" as const,
            required: true,
            attributes: [
              "id",
              "sId",
              "createdAt",
              "provider",
              "username",
              "email",
              "firstName",
              "lastName",
              "imageUrl",
              "lastLoginAt",
            ],
          },
        ],
      },
    ];
  }

  private static getForkedFromData(
    conversation: ConversationModel
  ): ConversationForkedFromType | undefined {
    const fork = conversation.forkedFrom;
    if (!fork) {
      return undefined;
    }

    assert(
      fork.parentConversation,
      "Forked conversation parent conversation must be loaded."
    );
    assert(
      fork.sourceMessage,
      "Forked conversation source message must be loaded."
    );
    assert(fork.createdByUser, "Forked conversation creator must be loaded.");

    return {
      parentConversationId: fork.parentConversation.sId,
      parentConversationTitle: fork.parentConversation.title,
      sourceMessageId: fork.sourceMessage.sId,
      branchedAt: fork.branchedAt.getTime(),
      user: new UserResource(
        UserResource.model,
        fork.createdByUser.get()
      ).toJSON(),
      fileCopyStatus: fork.fileCopyStatus,
    };
  }

  private static isPrivateConversationUrlsByDefaultEnabled(
    auth: Authenticator
  ): boolean {
    return (
      auth.getNonNullableWorkspace().metadata
        ?.privateConversationUrlsByDefault === true
    );
  }

  private static getConversationUrlAccessModeForPrivateByDefault(conversation: {
    metadata: ConversationMetadata;
  }): ConversationUrlAccessMode {
    return (
      getConversationUrlAccessMode(conversation.metadata) ?? "participants_only"
    );
  }

  private static shouldApplyPrivateByDefaultUrlRestriction(conversation: {
    spaceId: ModelId | null;
    depth: number;
  }): boolean {
    // Project and sub-conversations ignore the private by default url restriction.
    return conversation.spaceId === null && conversation.depth === 0;
  }

  private static fromModel(
    conversation: ConversationModel,
    space: SpaceResource | null
  ): ConversationResource {
    const resource = new this(this.model, conversation.get(), space);
    const forkedFrom = this.getForkedFromData(conversation);
    if (forkedFrom) {
      resource._forkingData = { forkedFrom };
    }

    return resource;
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[],
    {
      transaction,
      excludeTest,
      updatedAfter,
      includeDeleted,
      includeForkingData,
      loadSpaces,
    }: {
      transaction?: Transaction;
      excludeTest?: boolean;
      updatedAfter?: Date;
      includeDeleted?: boolean;
      includeForkingData?: boolean;
      loadSpaces?: boolean;
    } = {}
  ): Promise<ConversationResource[]> {
    if (ids.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();

    const excludedVisibilities: ConversationVisibility[] = [];

    if (!includeDeleted) {
      excludedVisibilities.push("deleted");
    }

    if (excludeTest) {
      excludedVisibilities.push("test");
    }

    const conversations = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        id: ids,
        ...(excludedVisibilities.length > 0
          ? { visibility: { [Op.notIn]: excludedVisibilities } }
          : {}),
        ...(updatedAfter ? { updatedAt: { [Op.gte]: updatedAfter } } : {}),
      } as WhereOptions<ConversationModel>,
      ...(includeForkingData ? { include: this.getForkedFromInclude() } : {}),
      transaction,
    });

    let spaceIdToSpaceMap: Map<ModelId, SpaceResource> = new Map();
    if (loadSpaces) {
      const uniqueSpaceIds = uniq(
        removeNulls(conversations.map((c) => c.spaceId))
      );
      const spaces =
        uniqueSpaceIds.length === 0
          ? []
          : await SpaceResource.fetchByModelIds(auth, uniqueSpaceIds, {
              includeDeleted,
              transaction,
            });
      spaceIdToSpaceMap = new Map(spaces.map((s) => [s.id, s]));
    }

    // Note: no permission filtering here. Callers must ensure the auth is allowed.
    return conversations.map((c) =>
      this.fromModel(
        c,
        loadSpaces && c.spaceId
          ? (spaceIdToSpaceMap.get(c.spaceId) ?? null)
          : null
      )
    );
  }

  /**
   * Fetch conversations by ModelId across all workspaces (no auth scoping).
   * Used by the sandbox reaper, which operates across every workspace and only
   * needs the conversation rows to drive sandbox lifecycle transitions.
   *
   * / WORKSPACE_ISOLATION_BYPASS: The reaper operates across all workspaces.
   */
  static async dangerouslyFetchByModelIds(
    ids: ModelId[]
  ): Promise<ConversationResource[]> {
    if (ids.length === 0) {
      return [];
    }

    // The reaper needs to drive sandbox lifecycle transitions even for deleted
    // conversations, so we include every visibility here.
    const conversations = await this.model.findAll({
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: {
        id: ids,
      },
    });

    return conversations.map((c) => this.fromModel(c, null));
  }

  get forkingData(): ConversationForkingDataType | undefined {
    return this._forkingData;
  }

  private static async listSerializedChildForks(
    auth: Authenticator,
    conversation: ConversationResource
  ): Promise<ConversationForkedChildType[]> {
    const workspace = auth.getNonNullableWorkspace();

    const forks = await ConversationForkModel.findAll({
      where: {
        workspaceId: workspace.id,
        parentConversationId: conversation.id,
      },
      order: [
        ["branchedAt", "ASC"],
        ["id", "ASC"],
      ],
      include: [
        {
          model: ConversationModel,
          as: "childConversation",
          required: true,
          attributes: ["sId", "title", "createdAt"],
        },
        {
          model: MessageModel,
          as: "sourceMessage",
          required: true,
          attributes: ["sId"],
        },
        {
          model: UserModel,
          as: "createdByUser",
          required: true,
          attributes: [
            "id",
            "sId",
            "createdAt",
            "provider",
            "username",
            "email",
            "firstName",
            "lastName",
            "imageUrl",
            "lastLoginAt",
          ],
        },
      ],
    });

    if (forks.length === 0) {
      return [];
    }

    const childConversationIds = forks.flatMap((fork) => {
      assert(
        fork.childConversation,
        "Forked child conversation must be loaded for parent lineage."
      );

      return [fork.childConversation.sId];
    });

    const readableChildConversationIds = new Set(
      (await this.fetchByIds(auth, childConversationIds)).map(
        (childConversation) => childConversation.sId
      )
    );

    return forks.flatMap((fork) => {
      assert(
        fork.childConversation,
        "Forked child conversation must be loaded for parent lineage."
      );
      assert(
        fork.sourceMessage,
        "Forked source message must be loaded for parent lineage."
      );
      assert(
        fork.createdByUser,
        "Forked creator must be loaded for parent lineage."
      );

      if (!readableChildConversationIds.has(fork.childConversation.sId)) {
        return [];
      }

      const branchedAtMs = fork.branchedAt.getTime();
      const sourceMessageId = fork.sourceMessage.sId;
      const user = new UserResource(
        UserResource.model,
        fork.createdByUser.get()
      ).toJSON();

      return [
        {
          childConversationId: fork.childConversation.sId,
          childConversationTitle: getConversationDisplayTitle({
            created: fork.childConversation.createdAt.getTime(),
            forkingData: {
              forkedFrom: {
                parentConversationId: conversation.sId,
                parentConversationTitle: conversation.title,
                sourceMessageId,
                branchedAt: branchedAtMs,
                user,
                fileCopyStatus: "done" as const,
              },
            },
            title: fork.childConversation.title,
          }),
          sourceMessageId,
          branchedAt: branchedAtMs,
          user,
        },
      ];
    });
  }

  async fetchForkingData(
    auth: Authenticator
  ): Promise<ConversationForkingDataType | undefined> {
    const forkedChildren = await ConversationResource.listSerializedChildForks(
      auth,
      this
    );

    if (!this.forkingData?.forkedFrom && forkedChildren.length === 0) {
      return undefined;
    }

    return {
      ...(this.forkingData?.forkedFrom && {
        forkedFrom: this.forkingData.forkedFrom,
      }),
      ...(forkedChildren.length > 0 && { forkedChildren }),
    };
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
    space: SpaceResource | null,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<ConversationResource> {
    const workspace = auth.getNonNullableWorkspace();

    // Check if the user has access to the space.
    // Use read because space members do not have write access to the space; write is tied to data
    // sources.
    if (space && !auth.can("read", space)) {
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

    if ((blob.spaceId ?? null) !== (space?.id ?? null)) {
      throw new Error("Space resource must match space id.");
    }

    const requestedSpaceIds =
      space && !blob.requestedSpaceIds.includes(space.id)
        ? [...blob.requestedSpaceIds, space.id]
        : blob.requestedSpaceIds;

    // Default `useFileSystem` to true when the caller hasn't pinned a value. Pinning the flag on
    // the conversation gives stable behavior across its lifetime:
    // existing conversations (no flag set) keep the legacy behavior.
    const metadata: ConversationMetadata = blob.metadata
      ? { ...blob.metadata }
      : {};
    if (metadata.useFileSystem === undefined) {
      metadata.useFileSystem = true;
    }

    const conversation = await this.model.create(
      {
        ...blob,
        metadata,
        requestedSpaceIds,
        workspaceId: workspace.id,
      },
      { transaction }
    );

    const resource = new ConversationResource(
      ConversationResource.model,
      conversation.get(),
      space
    );

    return resource;
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

  /**
   * Returns user message counts grouped by conversationId for the given
   * conversation model IDs.
   */
  static async getUserMessageCountsByConversationIds(
    auth: Authenticator,
    conversationIds: ModelId[]
  ): Promise<Map<ModelId, number>> {
    const workspace = auth.getNonNullableWorkspace();

    const rows = await MessageModel.findAll({
      attributes: [
        "conversationId",
        [frontSequelize.fn("COUNT", frontSequelize.col("id")), "count"],
      ],
      where: {
        workspaceId: workspace.id,
        conversationId: { [Op.in]: conversationIds },
        userMessageId: { [Op.ne]: null },
      },
      group: ["conversationId"],
    });

    const result = new Map<ModelId, number>();
    for (const row of rows) {
      result.set(row.conversationId, parseInt(row.get("count") as string, 10));
    }
    return result;
  }

  /**
   * Returns counts of distinct workspace users who authored a user message (non-null
   * {@link UserMessageModel.userId}) per conversation.
   */
  static async getDistinctUserCountsByConversationIds(
    workspaceId: ModelId,
    conversationIds: ModelId[]
  ): Promise<Map<ModelId, number>> {
    const result = new Map<ModelId, number>();
    if (conversationIds.length === 0) {
      return result;
    }

    const rows = await MessageModel.findAll({
      attributes: [
        "conversationId",
        [
          fn("COUNT", fn("DISTINCT", col("userMessage.userId"))),
          "distinctUserCount",
        ],
      ],
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          attributes: [],
          required: true,
          where: {
            userId: { [Op.ne]: null },
          },
        },
      ],
      where: {
        workspaceId,
        conversationId: { [Op.in]: conversationIds },
        userMessageId: { [Op.ne]: null },
      },
      group: ["message.conversationId"],
    });

    for (const row of rows) {
      result.set(
        row.conversationId,
        parseInt(row.get("distinctUserCount") as string, 10)
      );
    }
    return result;
  }

  /**
   * Returns counts of failed agent messages grouped by conversationId for the
   * given conversation model IDs.
   */
  static async getFailedAgentMessageCountsByConversationIds(
    auth: Authenticator,
    conversationIds: ModelId[]
  ): Promise<Map<ModelId, number>> {
    const workspace = auth.getNonNullableWorkspace();

    const rows = await MessageModel.findAll({
      attributes: [
        "conversationId",
        [frontSequelize.fn("COUNT", frontSequelize.col("message.id")), "count"],
      ],
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          attributes: [],
          required: true,
          where: { status: "failed" },
        },
      ],
      where: {
        workspaceId: workspace.id,
        conversationId: { [Op.in]: conversationIds },
        agentMessageId: { [Op.ne]: null },
      },
      group: ["message.conversationId"],
    });

    const result = new Map<ModelId, number>();
    for (const row of rows) {
      result.set(row.conversationId, parseInt(row.get("count") as string, 10));
    }
    return result;
  }

  /**
   * Fetches everything needed to compute an agent message's credit cost: the
   * agent message model id (used to look up its runs and actions), its tracking
   * status, its runIds, and the origin of the user message that triggered it
   * (used to detect free-origin usage). Returns null when the agent message
   * cannot be found.
   */
  static async fetchAgentMessageCreditContext(
    auth: Authenticator,
    { agentMessageId }: { agentMessageId: string }
  ): Promise<{
    agentMessageModelId: ModelId;
    status: AgentMessageStatus;
    runIds: string[] | null;
    triggeringUserMessageOrigin: UserMessageOrigin | null;
    // The total cost already stored (and already recorded to the usage
    // counters) by a prior finalize of this message. Used to record only the
    // newly-accrued delta on re-finalize.
    previousCostCredits: number | null;
  } | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const messageRow = await MessageModel.findOne({
      where: { sId: agentMessageId, workspaceId },
      include: [
        { model: AgentMessageModel, as: "agentMessage", required: true },
      ],
    });

    const agentMessage = messageRow?.agentMessage;
    if (!agentMessage) {
      return null;
    }

    let triggeringUserMessageOrigin: UserMessageOrigin | null = null;
    if (messageRow.parentId !== null) {
      const parentRow = await MessageModel.findOne({
        where: { id: messageRow.parentId, workspaceId },
        include: [
          { model: UserMessageModel, as: "userMessage", required: false },
        ],
      });
      triggeringUserMessageOrigin =
        parentRow?.userMessage?.userContextOrigin ?? null;
    }

    return {
      agentMessageModelId: agentMessage.id,
      status: agentMessage.status,
      runIds: agentMessage.runIds,
      triggeringUserMessageOrigin,
      previousCostCredits: agentMessage.costCredits,
    };
  }

  /**
   * Loads the message graph needed to build consumption analytics without exposing Sequelize rows
   * outside the Resource layer.
   *
   * // TODO(2026-08-06 FLAV): I wish we had a MessageResource layer.
   */
  static async fetchAgentMessageConsumptionAnalyticsContext(
    auth: Authenticator,
    { agentMessageId }: { agentMessageId: string }
  ): Promise<AgentMessageConsumptionAnalyticsContext | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const messageRow = await MessageModel.findOne({
      where: { sId: agentMessageId, workspaceId },
      include: [
        { model: AgentMessageModel, as: "agentMessage", required: true },
        { model: ConversationModel, as: "conversation", required: true },
      ],
    });
    const agentMessage = messageRow?.agentMessage;
    const conversation = messageRow?.conversation;
    if (!messageRow || !agentMessage || !conversation) {
      return null;
    }

    const triggeringMessageRow =
      messageRow.parentId === null
        ? null
        : await MessageModel.findOne({
            where: {
              id: messageRow.parentId,
              conversationId: conversation.id,
              workspaceId,
            },
            include: [
              {
                model: UserMessageModel,
                as: "userMessage",
                required: true,
                include: [
                  {
                    model: UserModel,
                    required: false,
                    attributes: ["sId"],
                  },
                ],
              },
            ],
          });
    const triggeringUserMessage = triggeringMessageRow?.userMessage;
    if (!triggeringUserMessage) {
      return null;
    }

    return {
      agentMessage: {
        agentConfigurationId: agentMessage.agentConfigurationId,
        agentConfigurationVersion: agentMessage.agentConfigurationVersion,
        completedAt: agentMessage.completedAt,
        costCredits: agentMessage.costCredits,
        agentMessageModelId: agentMessage.id,
        modelResolutionMethod: agentMessage.modelResolutionMethod,
        resolvedModelId: agentMessage.resolvedModelId,
        resolvedProviderId: agentMessage.resolvedProviderId,
        resolvedReasoningEffort: agentMessage.resolvedReasoningEffort,
        runIds: agentMessage.runIds,
        status: agentMessage.status,
        version: messageRow.version,
      },
      conversation: {
        depth: conversation.depth,
        conversationId: conversation.sId,
        spaceModelId: conversation.spaceId,
        triggerModelId: conversation.triggerId,
      },
      triggeringUserMessage: {
        agenticOriginMessageId:
          triggeringUserMessage.agenticOriginMessageId ?? null,
        apiKeyModelId: triggeringUserMessage.userContextApiKeyId,
        origin: triggeringUserMessage.userContextOrigin,
        userId: triggeringUserMessage.user?.sId ?? null,
      },
    };
  }

  static async updateAgentMessageCostCredits(
    auth: Authenticator,
    {
      agentMessageModelId,
      costCredits,
    }: { agentMessageModelId: ModelId; costCredits: number | null }
  ): Promise<void> {
    await AgentMessageModel.update(
      { costCredits },
      {
        where: {
          id: agentMessageModelId,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );
  }

  /**
   * Recursively sums the `costCredits` of every sub-agent spawned by a single
   * origin agent message (one recursive query, `maxDepth`-bounded). Only counts
   * sub-agents whose triggering user message is a `run_agent` agentic origin
   * (`agent_handover` and non-agentic origins are excluded). Single-message by
   * design (and avoids an N+1); returns `0` when there are no sub-agents.
   */
  static async sumSubAgentCostCreditsByMessageId(
    auth: Authenticator,
    {
      agentMessageId,
      maxDepth = 10,
    }: { agentMessageId: string; maxDepth?: number }
  ): Promise<number> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const query = `
      WITH RECURSIVE sub_agents AS (
        -- Direct sub-agent replies of the origin agent message.
        SELECT
          reply."sId"      AS agent_message_sid,
          am."costCredits" AS cost_credits,
          1                AS depth
        FROM user_messages um
        JOIN messages user_msg
          ON user_msg."userMessageId" = um.id
         AND user_msg."workspaceId" = um."workspaceId"
        JOIN messages reply
          ON reply."parentId" = user_msg.id
         AND reply."workspaceId" = um."workspaceId"
         AND reply."agentMessageId" IS NOT NULL
        JOIN agent_messages am
          ON am.id = reply."agentMessageId"
         AND am."workspaceId" = um."workspaceId"
        WHERE um."workspaceId" = :workspaceId
          AND um."agenticOriginMessageId" = :agentMessageId
          AND um."agenticMessageType" = 'run_agent'

        UNION ALL

        -- Sub-agents spawned (recursively) by previously found sub-agent replies.
        SELECT
          reply."sId",
          am."costCredits",
          s.depth + 1
        FROM sub_agents s
        JOIN user_messages um
          ON um."agenticOriginMessageId" = s.agent_message_sid
         AND um."workspaceId" = :workspaceId
         AND um."agenticMessageType" = 'run_agent'
        JOIN messages user_msg
          ON user_msg."userMessageId" = um.id
         AND user_msg."workspaceId" = :workspaceId
        JOIN messages reply
          ON reply."parentId" = user_msg.id
         AND reply."workspaceId" = :workspaceId
         AND reply."agentMessageId" IS NOT NULL
        JOIN agent_messages am
          ON am.id = reply."agentMessageId"
         AND am."workspaceId" = :workspaceId
        WHERE s.depth < :maxDepth
      )
      SELECT
        SUM(COALESCE(cost_credits, 0))::float AS total_credits,
        MAX(depth)::int                       AS max_depth
      FROM sub_agents
    `;

    // biome-ignore lint/plugin/noRawSql: recursive CTE has no Sequelize equivalent.
    const rows = await frontSequelize.query<{
      total_credits: number | null;
      max_depth: number | null;
    }>(query, {
      type: QueryTypes.SELECT,
      replacements: { workspaceId, agentMessageId, maxDepth },
    });

    // No sub-agents: the CTE is empty and SUM/MAX over zero rows return NULL.
    const row = rows[0];
    if (!row || row.total_credits === null) {
      return 0;
    }

    if (row.max_depth !== null && row.max_depth >= maxDepth) {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentMessageId,
          maxDepth,
        },
        "[Credits] Sub-agent cost aggregation hit the depth cap; total may be truncated."
      );
    }

    return row.total_credits;
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

    if (options?.onlyRootConversations) {
      where.depth = { [Op.eq]: 0 };
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

    const { transaction } = fetchConversationOptions ?? {};

    const conversations = await this.model.findAll({
      where: {
        ...where,
        ...options.where,
        workspaceId: workspace.id,
      },
      ...(fetchConversationOptions?.includeForkingData
        ? { include: this.getForkedFromInclude() }
        : {}),
      limit: options.limit,
      order: options.order,
      transaction,
    });

    // Include both `spaceId` (pod ACL) and `requestedSpaceIds` (private conversation
    // conjunctive ACL). Pod conversations must load their project space even when
    // `requestedSpaceIds` later accumulates spaces the viewer cannot read.
    const uniqueSpaceIds = removeNulls(
      uniq([
        ...conversations
          .filter((c) => c.spaceId !== null)
          .map((c) => c.spaceId),
        ...conversations.flatMap((c) => c.requestedSpaceIds),
      ])
    );

    // Only fetch spaces if there are any used spaces.
    const spaces =
      uniqueSpaceIds.length === 0
        ? []
        : await SpaceResource.fetchByModelIds(auth, uniqueSpaceIds, {
            includeDeleted: fetchConversationOptions?.includeDeleted,
            transaction,
          });

    const spaceIdToSpaceMap = new Map(spaces.map((s) => [s.id, s]));

    if (fetchConversationOptions?.dangerouslySkipPermissionFiltering) {
      return conversations.map((c) =>
        this.fromModel(
          c,
          c.spaceId ? (spaceIdToSpaceMap.get(c.spaceId) ?? null) : null
        )
      );
    }

    const { podConversations, regularConversations } = conversations.reduce(
      (acc, c) => {
        if (c.spaceId !== null) {
          acc.podConversations.push(
            c as ConversationModel & { spaceId: ModelId }
          );
        } else {
          acc.regularConversations.push(c);
        }
        return acc;
      },
      {
        podConversations: [] as (ConversationModel & { spaceId: ModelId })[],
        regularConversations: [] as ConversationModel[],
      }
    );

    // Pod conversations (`spaceId` set): visibility is gated only on read access to
    // the project space. Extra ids in `requestedSpaceIds` (agents, skills, …) do not
    // further restrict who can open the conversation — they remain a runtime/scope
    // concern, not a conjunctive ACL. Missing/deleted project spaces deny access.
    const accessiblePodConversations: ConversationResource[] = podConversations
      .filter((c) => {
        const space = spaceIdToSpaceMap.get(c.spaceId);
        return space ? auth.can("read", space) : false;
      })
      .map((c) => this.fromModel(c, spaceIdToSpaceMap.get(c.spaceId) ?? null));

    // If there are no regular conversations, return the accessible pod conversations immediately.
    if (regularConversations.length === 0) {
      return accessiblePodConversations;
    }

    // Private conversations (`spaceId` null): viewer must be able to read every
    // space in `requestedSpaceIds` (conjunctive ACL). Filter out conversations that
    // reference missing/deleted spaces:
    // 1. When a space is deleted, conversations referencing it won't be deleted but should not be accessible.
    // 2. When a space belongs to another workspace (should not happen), conversations referencing it won't be accessible.
    const foundSpaceIds = new Set(spaces.map((s) => s.id));
    const validConversations = regularConversations
      .filter((c) => c.requestedSpaceIds.every((id) => foundSpaceIds.has(id)))
      .map((c) =>
        this.fromModel(
          c,
          c.spaceId ? (spaceIdToSpaceMap.get(c.spaceId) ?? null) : null
        )
      );

    const spaceBasedAccessible = validConversations.filter((c) =>
      canReadRequestedSpaces(auth, spaceIdToSpaceMap, c.requestedSpaceIds)
    );

    if (spaceBasedAccessible.length === 0) {
      return [...accessiblePodConversations, ...spaceBasedAccessible];
    }

    if (
      !this.isPrivateConversationUrlsByDefaultEnabled(auth) ||
      shouldByPassPrivateByDefaultUrlRestriction(auth)
    ) {
      return [...accessiblePodConversations, ...spaceBasedAccessible];
    }

    const participantRestrictedConversations = spaceBasedAccessible.filter(
      (conversation) =>
        this.shouldApplyPrivateByDefaultUrlRestriction(conversation) &&
        this.getConversationUrlAccessModeForPrivateByDefault(conversation) ===
          "participants_only"
    );

    // No participant-restricted conversations, return the space-based accessible conversations.
    if (participantRestrictedConversations.length === 0) {
      return [...accessiblePodConversations, ...spaceBasedAccessible];
    }

    // For all participant-restricted conversations, check if the user is a participant. A userless
    // authenticator (e.g. a userless sandbox token driven by a non-human actor, or a session/oauth
    // request with no matching Dust user) can never be a participant, so it sees none of them. This
    // mirrors the null-user handling in canUserAccessPrivateByDefaultConversation.
    const user = auth.user();
    const participations = user
      ? await ConversationParticipantModel.findAll({
          where: {
            workspaceId: workspace.id,
            userId: user.id,
            conversationId: {
              [Op.in]: participantRestrictedConversations.map((c) => c.id),
            },
          },
          attributes: ["conversationId"],
          transaction,
        })
      : [];

    const participantConversationIds = new Set(
      participations.map((p) => p.conversationId)
    );

    // Return the space-based accessible conversations that are not participant-restricted.
    // Or are participant-restricted and the user is a participant.
    return [
      ...accessiblePodConversations,
      ...spaceBasedAccessible.filter(
        (conversation) =>
          !this.shouldApplyPrivateByDefaultUrlRestriction(conversation) ||
          this.getConversationUrlAccessModeForPrivateByDefault(conversation) ===
            "workspace_members" ||
          participantConversationIds.has(conversation.id)
      ),
    ];
  }

  private static async canUserAccessPrivateByDefaultConversation(
    auth: Authenticator,
    conversation: ConversationModel
  ): Promise<boolean> {
    if (!this.isPrivateConversationUrlsByDefaultEnabled(auth)) {
      return true;
    }

    if (!this.shouldApplyPrivateByDefaultUrlRestriction(conversation)) {
      return true;
    }

    if (
      this.getConversationUrlAccessModeForPrivateByDefault(conversation) ===
      "workspace_members"
    ) {
      return true;
    }

    if (shouldByPassPrivateByDefaultUrlRestriction(auth)) {
      return true;
    }

    const user = auth.user();
    if (!user) {
      return false;
    }

    const participationCount = await ConversationParticipantModel.count({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
        userId: user.id,
      },
    });

    return participationCount > 0;
  }

  static async canAccess(
    auth: Authenticator,
    sId: string
  ): Promise<ConversationAccessType> {
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

    // Pod conversations: same contract as `baseFetchWithAuthorization` — only the
    // project space's readability matters, not the full `requestedSpaceIds` set.
    if (conversation.spaceId !== null) {
      const spaces = await SpaceResource.fetchByModelIds(auth, [
        conversation.spaceId,
      ]);
      return spaces.length > 0 && auth.can("read", spaces[0])
        ? "allowed"
        : "conversation_access_restricted";
    }

    // Private conversations: the viewer must read every requested space (conjunctive ACL). A
    // requested space missing from the fetch — deleted, or belonging to another workspace — means
    // the conversation can no longer be located, not merely that access is restricted.
    const spaces = await SpaceResource.fetchByModelIds(
      auth,
      conversation.requestedSpaceIds
    );
    const spaceById = new Map(spaces.map((s) => [s.id, s]));

    if (conversation.requestedSpaceIds.some((id) => !spaceById.has(id))) {
      return "conversation_not_found";
    }

    if (
      !canReadRequestedSpaces(auth, spaceById, conversation.requestedSpaceIds)
    ) {
      return "conversation_access_restricted";
    }

    if (
      !(await this.canUserAccessPrivateByDefaultConversation(
        auth,
        conversation
      ))
    ) {
      return "conversation_access_restricted_by_private_by_default_url_restriction";
    }

    return "allowed";
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

  async listParticipantsForConversation(): Promise<
    Array<{
      userId: string;
      actionRequired: boolean;
    }>
  > {
    const participants = await ConversationParticipantModel.findAll({
      where: {
        conversationId: this.id,
        workspaceId: this.workspaceId,
      },
      attributes: ["userId", "actionRequired"],
      include: [{ model: UserModel, attributes: ["sId"] }],
    });

    return participants.flatMap((p) => {
      if (!p.user) {
        return [];
      }
      return [{ userId: p.user.sId, actionRequired: p.actionRequired }];
    });
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

    return new Map(
      participations.map((p) => [
        p.conversationId,
        {
          actionRequired: p.actionRequired,
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

  private static async enrichWithReadState(
    auth: Authenticator,
    conversations: ConversationResource[]
  ): Promise<void> {
    if (conversations.length === 0 || !auth.user()) {
      return;
    }

    const readMap = await this.fetchReadMapForUser(
      auth,
      conversations.map((c) => c.id)
    );

    conversations.forEach((c) => {
      c.userLastReadAt = readMap.get(c.id) ?? null;
    });
  }

  private static async enrichWithParticipationAndReadState(
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

    await this.enrichWithReadState(auth, conversations);
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

  static async fetchByIdsWithReadState(
    auth: Authenticator,
    sIds: string[],
    options?: FetchConversationOptions
  ) {
    const conversations = await this.fetchByIds(auth, sIds, options);
    await this.enrichWithReadState(auth, conversations);
    return conversations;
  }

  static async fetchByIdWithReadState(
    auth: Authenticator,
    sId: string,
    options?: FetchConversationOptions
  ): Promise<ConversationResource | null> {
    const res = await this.fetchByIdsWithReadState(auth, [sId], options);

    return res.length > 0 ? res[0] : null;
  }

  /**
   * Hydrates participation + read state so {@link ConversationResource#toListItem}
   * matches sidebar rows (same fields as inbox Elasticsearch lists, minus volatile ES-only bits).
   * Conversations the user cannot access are omitted from the map.
   */
  static async fetchListItemsBySIds(
    auth: Authenticator,
    sIds: string[]
  ): Promise<Map<string, ConversationListItemType>> {
    if (sIds.length === 0) {
      return new Map();
    }
    const uniqueSIds = [...new Set(sIds)];
    const conversations = await this.fetchByIds(auth, uniqueSIds);
    if (conversations.length === 0) {
      return new Map();
    }
    await this.enrichWithParticipationAndReadState(auth, conversations);
    await this.enrichWithNextWakeupAt(auth, conversations);
    return new Map(conversations.map((c) => [c.sId, c.toListItem()]));
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
  ): Promise<ConversationResource[]> {
    // Find all conversations that:
    // 1. Were created before the cutoff date.
    // 2. Have at least one message from the specified agent.
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Two-step approach for better performance:
    // Step 1: Get distinct conversation IDs that have messages from this agent.
    const messageWithAgent = await MessageModel.findAll({
      attributes: [
        [
          // Qualified: agent_messages also carries a conversationId column since the
          // side-table denormalization, so the bare name is ambiguous in this join.
          Sequelize.fn("DISTINCT", Sequelize.col("message.conversationId")),
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
    return this.baseFetchWithAuthorization(auth, options, {
      where: {
        id: {
          [Op.in]: conversationIds,
        },
        createdAt: {
          [Op.lt]: cutoffDate,
        },
      },
    });
  }

  /**
   * Page of the conversations in which `agentConfigurationId` produced at least one
   * message, optionally restricted to a `createdAt` window (`createdAfter` inclusive,
   * `createdBefore` exclusive). Paging and ordering happen in SQL: an active agent's
   * conversation set is unbounded, so neither its conversation ids nor the hydrated
   * conversations can be materialized in full.
   *
   * `totalCount` is the size of the matching set before visibility and permission
   * filtering, so it is an upper bound: a page can hold fewer than `limit`
   * conversations when the caller cannot read some of them.
   */
  static async listConversationsWithAgentPaginated(
    auth: Authenticator,
    {
      agentConfigurationId,
      limit,
      offset,
      orderColumn = "createdAt",
      orderDirection = "desc",
      createdAfter,
      createdBefore,
    }: {
      agentConfigurationId: string;
      limit: number;
      offset: number;
      orderColumn?: AgentConversationsOrderColumn;
      orderDirection?: "asc" | "desc";
      createdAfter?: Date;
      createdBefore?: Date;
    },
    options?: FetchConversationOptions
  ): Promise<{ conversations: ConversationResource[]; totalCount: number }> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Static fragments, so the window stays out of the plan entirely when unbounded.
    const windowConditions = [
      createdAfter ? `AND c."createdAt" >= :createdAfter` : "",
      createdBefore ? `AND c."createdAt" < :createdBefore` : "",
    ].join("\n       ");

    // Never interpolated from caller input: both halves come from closed unions.
    const direction = orderDirection === "asc" ? "ASC" : "DESC";
    // `id` breaks ties so a row cannot drift between pages as the offset moves.
    const orderBy = `${AGENT_CONVERSATIONS_ORDER_COLUMNS[orderColumn]} ${direction}, c."id" DESC`;

    // `agent_messages` carries `conversationId` since the side-table denormalization, so
    // the agent's conversations resolve without joining `messages`. The window count is
    // free: the full id set is already materialized to be sorted.
    const query = `
      WITH agent_conversations AS (
        SELECT DISTINCT am."conversationId"
        FROM agent_messages am
        WHERE am."workspaceId" = :workspaceId
          AND am."agentConfigurationId" = :agentConfigurationId
      )
      SELECT c."id", COUNT(*) OVER () AS total_count
      FROM agent_conversations ac
      JOIN conversations c
        ON c."id" = ac."conversationId"
       AND c."workspaceId" = :workspaceId
       ${windowConditions}
      ORDER BY ${orderBy}
      LIMIT :limit OFFSET :offset
    `;

    // biome-ignore lint/plugin/noRawSql: no association from conversations to agent_messages.
    const rows = await frontSequelize.query<{
      id: ModelId;
      total_count: number;
    }>(query, {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId,
        agentConfigurationId,
        limit,
        offset,
        ...(createdAfter && { createdAfter }),
        ...(createdBefore && { createdBefore }),
      },
    });

    if (rows.length === 0) {
      return { conversations: [], totalCount: 0 };
    }

    const conversations = await this.baseFetchWithAuthorization(auth, options, {
      where: {
        id: {
          [Op.in]: rows.map((r) => r.id),
        },
      },
    });

    // Walk the SQL order, which the hydrating fetch does not preserve. Ids the fetch
    // dropped on visibility or permissions simply fall out here.
    const conversationById = new Map(conversations.map((c) => [c.id, c]));
    const ordered = removeNulls(
      rows.map((r) => conversationById.get(r.id) ?? null)
    );

    return { conversations: ordered, totalCount: rows[0].total_count };
  }

  /**
   * For each agent, returns the sIds of qualifying conversations in the window
   * createdAt >= cutoffDate. With excludeHumanOutOfTheLoop, removes conversations where
   * triggerId IS NOT NULL and no user messages are present.
   */
  static async getConversationIdsByAgent(
    auth: Authenticator,
    {
      agentIds,
      cutoffDate,
      excludeHumanOutOfTheLoop = false,
    }: {
      agentIds: string[];
      cutoffDate: Date;
      excludeHumanOutOfTheLoop?: boolean;
    }
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>(agentIds.map((sId) => [sId, []]));

    if (agentIds.length === 0) {
      return result;
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    const participations = await AgentMessageModel.findAll({
      attributes: ["agentConfigurationId"],
      where: {
        workspaceId,
        agentConfigurationId: { [Op.in]: agentIds },
        createdAt: { [Op.gte]: cutoffDate },
      },
      include: [
        {
          model: MessageModel,
          as: "message",
          required: true,
          attributes: ["conversationId"],
        },
      ],
    });

    if (participations.length === 0) {
      return result;
    }

    const allConvIds: ModelId[] = [
      ...new Set(participations.map((p) => p.message!.conversationId)),
    ];

    const conversations = await ConversationModel.findAll({
      attributes: ["id", "sId", "triggerId"],
      where: { workspaceId, id: { [Op.in]: allConvIds } },
    });

    if (conversations.length === 0) {
      return result;
    }

    const sIdById = new Map<ModelId, string>(
      conversations.map((c) => [c.id, c.sId])
    );

    const agentToConvIds = new Map<string, Set<string>>();
    for (const p of participations) {
      const convSId = sIdById.get(p.message!.conversationId);
      if (!convSId) {
        continue;
      }
      const agentId = p.agentConfigurationId;
      if (!agentToConvIds.has(agentId)) {
        agentToConvIds.set(agentId, new Set());
      }
      agentToConvIds.get(agentId)!.add(convSId);
    }

    let qualifyingConvSIds: Set<string>;

    if (!excludeHumanOutOfTheLoop) {
      qualifyingConvSIds = new Set(conversations.map((c) => c.sId));
    } else {
      const nonTriggered = conversations.filter((c) => c.triggerId === null);
      const triggered = conversations.filter((c) => c.triggerId !== null);

      if (triggered.length === 0) {
        qualifyingConvSIds = new Set(nonTriggered.map((c) => c.sId));
      } else {
        const triggeredWithUserMessages = await MessageModel.findAll({
          attributes: [
            [
              Sequelize.fn("DISTINCT", Sequelize.col("conversationId")),
              "conversationId",
            ],
          ],
          where: {
            workspaceId,
            conversationId: { [Op.in]: triggered.map((c) => c.id) },
          },
          include: [
            {
              model: UserMessageModel,
              as: "userMessage",
              required: true,
              attributes: [],
            },
          ],
          raw: true,
        });

        qualifyingConvSIds = new Set([
          ...nonTriggered.map((c) => c.sId),
          ...triggeredWithUserMessages
            .map((m) => sIdById.get(m.conversationId))
            .filter((sId): sId is string => sId !== undefined),
        ]);
      }
    }

    for (const [agentId, convSIds] of agentToConvIds) {
      const qualifying = [...convSIds].filter((sId) =>
        qualifyingConvSIds.has(sId)
      );
      if (qualifying.length > 0) {
        result.set(agentId, qualifying);
      }
    }

    return result;
  }

  /**
   * Returns the creation timestamps of the space's nudge conversations, newest
   * first: the conversations Dust opened itself, identified by the origin their
   * opening message carries. This is the activation nudge history.
   */
  static async listNudgeConversationTimestamps(
    auth: Authenticator,
    { spaceModelId, limit }: { spaceModelId: ModelId; limit: number }
  ): Promise<Date[]> {
    const messages = await MessageModel.findAll({
      attributes: ["createdAt"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        rank: 0,
      },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: true,
          attributes: [],
          where: { userContextOrigin: ACTIVATION_NUDGE_ORIGIN },
        },
        {
          model: ConversationModel,
          as: "conversation",
          required: true,
          attributes: [],
          where: { spaceId: spaceModelId },
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
    });

    return messages.map((m) => m.createdAt);
  }

  /**
   * When `userId` last posted in one of the space's conversations, or null if
   * they never did. Used by the activation scheduler to tell whether the user
   * came back after a nudge.
   */
  static async latestUserMessageAtInSpace(
    auth: Authenticator,
    { spaceModelId, userId }: { spaceModelId: ModelId; userId: ModelId }
  ): Promise<Date | null> {
    const message = await MessageModel.findOne({
      attributes: ["createdAt"],
      where: { workspaceId: auth.getNonNullableWorkspace().id },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: true,
          attributes: [],
          where: { userId },
        },
        {
          model: ConversationModel,
          as: "conversation",
          required: true,
          attributes: [],
          where: { spaceId: spaceModelId },
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return message?.createdAt ?? null;
  }

  /**
   * The origin of the conversation's opening user message, or null if it has
   * none. Used to tell a conversation Dust opened (an activation nudge) from
   * one the user started.
   */
  async openingUserMessageOrigin(
    auth: Authenticator
  ): Promise<UserMessageOrigin | null> {
    const message = await MessageModel.findOne({
      attributes: ["id"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: this.id,
        rank: 0,
      },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: true,
          attributes: ["userContextOrigin"],
        },
      ],
    });

    return message?.userMessage?.userContextOrigin ?? null;
  }

  static async fetchConversationWithParticipantState(
    auth: Authenticator,
    sId: string
  ): Promise<Result<ConversationWithoutContentType, ConversationError>> {
    const conversation = await this.fetchById(auth, sId);

    if (!conversation) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    await this.enrichWithParticipationAndReadState(auth, [conversation]);

    return new Ok(conversation.toJSON());
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

    await this.enrichWithReadState(auth, conversations);

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
      restrictToConversationModelIds,
    }: {
      pagination: {
        limit: number;
        lastValue?: string;
        orderDirection?: "asc" | "desc";
      };
      extraWhereClause?: WhereOptions<InferAttributes<ConversationModel>>;
      restrictToConversationModelIds?: ModelId[];
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

    const participationMap = await this.fetchParticipationMapForUser(
      auth,
      restrictToConversationModelIds
    );
    let conversationIds = Array.from(participationMap.keys());

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
    const order: Order = [
      ["updatedAt", orderDirection === "desc" ? "DESC" : "ASC"],
    ];

    // baseFetchWithAuthorization filters rows after the SQL limit (deleted
    // space references, ACLs), which corrupts the +1 sentinel: one dropped row
    // makes a full window look like the last page. Scan the raw window first
    // and derive hasMore and the cursor from the scan, not the filtered rows.
    const rawRows = await ConversationModel.findAll({
      where: { ...whereClause, workspaceId: auth.getNonNullableWorkspace().id },
      order,
      limit: fetchLimit,
      attributes: ["id", "updatedAt"],
    });

    if (rawRows.length === 0) {
      return emptyResult;
    }

    const hasMore = rawRows.length === fetchLimit;

    const conversations = await this.baseFetchWithAuthorization(
      auth,
      {},
      {
        where: { id: { [Op.in]: rawRows.map((r) => r.id) } },
        order,
      }
    );

    const resultConversations = conversations.slice(0, pagination.limit);

    resultConversations.forEach((c) => {
      const participation = participationMap.get(c.id);
      if (participation) {
        c.userParticipation = participation;
      }
    });

    await this.enrichWithReadState(auth, resultConversations);

    // Advance the cursor past the scanned window, unless accessible rows were
    // cut by the limit — those must reappear on the next page.
    const lastReturned = resultConversations[resultConversations.length - 1];
    const lastValue =
      conversations.length > pagination.limit && lastReturned
        ? lastReturned.updatedAt.getTime().toString()
        : rawRows[rawRows.length - 1].updatedAt.getTime().toString();

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
    conversations: ConversationListItemType[];
    hasMore: boolean;
    lastValue: string | null;
  }> {
    const result = await this.fetchPrivateConversationsPaginated(auth, {
      pagination,
    });
    await this.enrichWithNextWakeupAt(auth, result.conversations);

    return {
      conversations: result.conversations.map((c) => c.toListItem()),
      hasMore: result.hasMore,
      lastValue: result.lastValue,
    };
  }

  /**
   * This wake-up hydration lives here instead of `WakeUpResource` because `WakeUpResource` already
   * depends on `ConversationResource` to reuse the established conversation ES reindexing path.
   * This is all to avoid import cycles.
   */
  private static async enrichWithNextWakeupAt(
    auth: Authenticator,
    conversations: ConversationResource[]
  ): Promise<void> {
    if (conversations.length === 0) {
      return;
    }

    const wakeUps = await WakeUpModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: { [Op.in]: conversations.map((c) => c.id) },
        status: ACTIVE_WAKE_UP_STATUSES,
      },
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
    });

    const nextWakeupAtByConversationId = new Map<ModelId, number>();
    for (const wakeUp of wakeUps) {
      const scheduleConfig: WakeUpScheduleConfig | null = (() => {
        switch (wakeUp.scheduleType) {
          case "one_shot":
            return wakeUp.fireAt
              ? { type: "one_shot", fireAt: wakeUp.fireAt.getTime() }
              : null;
          case "cron":
            return wakeUp.cronExpression && wakeUp.cronTimezone
              ? {
                  type: "cron",
                  cron: wakeUp.cronExpression,
                  timezone: wakeUp.cronTimezone,
                }
              : null;
          default:
            return assertNever(wakeUp.scheduleType);
        }
      })();

      const nextWakeupAt = scheduleConfig
        ? getNextWakeUpFireAtFromScheduleConfig(scheduleConfig)
        : null;
      if (nextWakeupAt === null) {
        continue;
      }

      const previous = nextWakeupAtByConversationId.get(wakeUp.conversationId);
      if (previous === undefined || nextWakeupAt < previous) {
        nextWakeupAtByConversationId.set(wakeUp.conversationId, nextWakeupAt);
      }
    }

    for (const conversation of conversations) {
      conversation.nextWakeupAt =
        nextWakeupAtByConversationId.get(conversation.id) ?? null;
    }
  }

  static async listSpaceUnreadConversationsAndActivityForUser(
    auth: Authenticator,
    spaceIds: number[]
  ): Promise<{
    unreadConversations: ConversationResource[];
    nonParticipantUnreadConversations: ConversationResource[];
    lastUserActivityBySpace: Map<number, Date>;
  }> {
    if (spaceIds.length === 0) {
      return {
        unreadConversations: [],
        nonParticipantUnreadConversations: [],
        lastUserActivityBySpace: new Map(),
      };
    }
    const conversations = await this.baseFetchWithAuthorization(
      auth,
      {},
      {
        where: {
          spaceId: { [Op.in]: spaceIds },
          visibility: { [Op.eq]: "unlisted" },
          depth: { [Op.eq]: 0 }, // Only fetch root conversations
        },
      }
    );

    if (conversations.length === 0) {
      return {
        unreadConversations: [],
        nonParticipantUnreadConversations: [],
        lastUserActivityBySpace: new Map(),
      };
    }

    await this.enrichWithParticipationAndReadState(auth, conversations);

    // These conversations are used to display the unread count in the sidebar.
    // We do not count conversations the user does not participate in.
    const unreadConversations = conversations.filter(
      (c) =>
        c.userParticipation &&
        (c.userLastReadAt === null || c.updatedAt > c.userLastReadAt)
    );

    const nonParticipantUnreadConversations = conversations.filter(
      (c) =>
        !c.userParticipation &&
        (c.userLastReadAt === null || c.updatedAt > c.userLastReadAt)
    );

    // Hydrate next wake-up only for participant unread conversations, which are
    // serialized into the sidebar inbox. Non-participant unread IDs are only
    // used for the activity badge.
    await this.enrichWithNextWakeupAt(auth, unreadConversations);

    const lastUserActivityBySpace = new Map<number, Date>();

    for (const conversation of conversations) {
      const spaceModelId = conversation.space?.id;
      if (!spaceModelId) {
        continue;
      }
      const lastReadAt = conversation.userLastReadAt;
      if (lastReadAt) {
        const current = lastUserActivityBySpace.get(spaceModelId);
        if (!current || lastReadAt > current) {
          lastUserActivityBySpace.set(spaceModelId, lastReadAt);
        }
      }
    }

    return {
      unreadConversations,
      nonParticipantUnreadConversations,
      lastUserActivityBySpace,
    };
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

    await this.enrichWithParticipationAndReadState(auth, conversations);

    return conversations;
  }

  static async listConversationsInSpacePaginated(
    auth: Authenticator,
    {
      spaceId,
      options,
      pagination,
      restrictToConversationModelIds,
      filter = "all",
      excludeTriggered = false,
    }: {
      spaceId: string;
      options?: FetchConversationOptions;
      pagination: {
        limit: number;
        lastValue?: string;
        orderDirection?: "asc" | "desc";
      };
      restrictToConversationModelIds?: ModelId[];
      filter?: SpaceConversationsFilter;
      /**
       * When true, conversations created by a trigger (`triggerId IS NOT NULL`)
       * are excluded in SQL so pagination stays dense under heavy automation.
       * Orthogonal to `filter` (participation scope).
       */
      excludeTriggered?: boolean;
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

    const { where: filterWhere } = this.getOptions(options);
    const whereClause: WhereOptions<InferAttributes<ConversationModel>> = {
      ...filterWhere,
      spaceId: spaceModelId,
      depth: { [Op.eq]: 0 }, // Only fetch root conversations
      ...(restrictToConversationModelIds && {
        id: { [Op.in]: restrictToConversationModelIds },
      }),
      ...(excludeTriggered && { triggerId: null }),
    };

    if (pagination.lastValue) {
      const timestampMs = parseInt(pagination.lastValue, 10);
      if (!Number.isNaN(timestampMs)) {
        const operator = orderDirection === "desc" ? Op.lt : Op.gt;
        const cursorConstraint = { [operator]: new Date(timestampMs) };
        const existingUpdatedAt = whereClause.updatedAt;
        if (
          existingUpdatedAt &&
          typeof existingUpdatedAt === "object" &&
          !Array.isArray(existingUpdatedAt)
        ) {
          whereClause.updatedAt = {
            ...existingUpdatedAt,
            ...cursorConstraint,
          };
        } else {
          whereClause.updatedAt = cursorConstraint;
        }
      }
    }

    const chunkSize = Math.max(pagination.limit + 1, 30);
    const filteredConversations: ConversationResource[] = [];
    let fetchCursor = pagination.lastValue;
    let hasMoreRawConversations = true;

    while (
      filteredConversations.length <= pagination.limit &&
      hasMoreRawConversations
    ) {
      const batchWhereClause: WhereOptions<InferAttributes<ConversationModel>> =
        {
          ...whereClause,
        };

      if (fetchCursor) {
        const cursorMs = parseInt(fetchCursor, 10);
        if (!Number.isNaN(cursorMs)) {
          const operator = orderDirection === "desc" ? Op.lt : Op.gt;
          const cursorConstraint = { [operator]: new Date(cursorMs) };
          const existingUpdatedAt = batchWhereClause.updatedAt;

          if (
            existingUpdatedAt &&
            typeof existingUpdatedAt === "object" &&
            !Array.isArray(existingUpdatedAt)
          ) {
            batchWhereClause.updatedAt = {
              ...existingUpdatedAt,
              ...cursorConstraint,
            };
          } else {
            batchWhereClause.updatedAt = cursorConstraint;
          }
        }
      }

      const conversationsBatch = await this.baseFetchWithAuthorization(
        auth,
        options,
        {
          where: batchWhereClause,
          order: [["updatedAt", orderDirection === "desc" ? "DESC" : "ASC"]],
          limit: chunkSize,
        }
      );

      hasMoreRawConversations = conversationsBatch.length === chunkSize;

      if (conversationsBatch.length === 0) {
        break;
      }

      let matchingConversations = conversationsBatch;

      if (filter === "with_me") {
        const user = auth.user();
        if (!user) {
          matchingConversations = [];
        } else {
          const participations = await ConversationParticipantModel.findAll({
            where: {
              workspaceId: auth.getNonNullableWorkspace().id,
              userId: user.id,
              conversationId: {
                [Op.in]: conversationsBatch.map((c) => c.id),
              },
              action: "posted",
            },
            attributes: ["conversationId"],
          });

          const matchingConversationIds = new Set(
            participations.map((p) => p.conversationId)
          );
          matchingConversations = conversationsBatch.filter((conversation) =>
            matchingConversationIds.has(conversation.id)
          );
        }
      }

      if (filter === "group") {
        const workspaceId = auth.getNonNullableWorkspace().id;
        const batchConversationIds = conversationsBatch.map((c) => c.id);

        const participants = await ConversationParticipantModel.findAll({
          where: {
            workspaceId,
            conversationId: {
              [Op.in]: batchConversationIds,
            },
            action: {
              [Op.in]: ["posted", "subscribed"],
            },
          },
          attributes: ["conversationId", "userId"],
        });

        const participantUserIdsByConversation = new Map<
          ModelId,
          Set<ModelId>
        >();
        for (const participant of participants) {
          const existingUserIds =
            participantUserIdsByConversation.get(participant.conversationId) ??
            new Set<ModelId>();
          existingUserIds.add(participant.userId);
          participantUserIdsByConversation.set(
            participant.conversationId,
            existingUserIds
          );
        }

        const groupConversationIdsFromParticipants = new Set<ModelId>(
          [...participantUserIdsByConversation.entries()].flatMap(
            ([conversationId, participantUserIds]) =>
              participantUserIds.size >= 2 ? [conversationId] : []
          )
        );

        const candidateIdsForMessagePass = batchConversationIds.filter(
          (id) => !groupConversationIdsFromParticipants.has(id)
        );

        const distinctAuthorsByConversation =
          candidateIdsForMessagePass.length === 0
            ? new Map<ModelId, number>()
            : await this.getDistinctUserCountsByConversationIds(
                workspaceId,
                candidateIdsForMessagePass
              );

        const groupConversationIds = new Set<ModelId>(
          groupConversationIdsFromParticipants
        );
        for (const [conversationId, count] of distinctAuthorsByConversation) {
          if (count > 1) {
            groupConversationIds.add(conversationId);
          }
        }

        matchingConversations = conversationsBatch.filter((conversation) =>
          groupConversationIds.has(conversation.id)
        );
      }

      filteredConversations.push(...matchingConversations);

      const lastConversationInBatch =
        conversationsBatch[conversationsBatch.length - 1];
      fetchCursor = lastConversationInBatch.updatedAt.getTime().toString();
    }

    const hasMore = filteredConversations.length > pagination.limit;
    const resultConversations = hasMore
      ? filteredConversations.slice(0, pagination.limit)
      : filteredConversations;

    await this.enrichWithParticipationAndReadState(auth, resultConversations);

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
        depth: { [Op.eq]: 0 }, // Only fetch root conversations
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

    let participationByConversationId = new Map<ModelId, UserParticipation>();
    let lastReadByConversationId = new Map<ModelId, Date>();
    if (auth.user() && conversations.length > 0) {
      const conversationIds = conversations.map((c) => c.id);
      participationByConversationId =
        await ConversationResource.fetchParticipationMapForUser(
          auth,
          conversationIds
        );
      lastReadByConversationId = await ConversationResource.fetchReadMapForUser(
        auth,
        conversationIds
      );
    }

    return conversations.map((c) => {
      const participation = participationByConversationId.get(c.id);
      const lastReadAt = lastReadByConversationId.get(c.id) ?? null;

      return {
        id: c.id,
        created: c.createdAt.getTime(),
        updated: c.updatedAt.getTime(),
        sId: c.sId,
        title: c.title,
        triggerId: triggerId,
        actionRequired: participation?.actionRequired ?? false,
        unread: lastReadAt === null || c.updatedAt > lastReadAt,
        lastReadMs: lastReadAt?.getTime() ?? null,
        hasError: c.hasError,
        requestedGroupIds: [],
        requestedSpaceIds: c.getRequestedSpaceIdsFromModel(),
        spaceId: c.space?.sId ?? null,
        depth: c.depth,
        metadata: c.metadata,
        isRunningAgentLoop: c.isRunningAgentLoop,
        isParticipant: !!participation,
      };
    });
  }

  static async listSkillReinforcementConversations(
    auth: Authenticator,
    skillId: string,
    { after }: { after?: Date } = {}
  ): Promise<ConversationWithoutContentType[]> {
    const workspace = auth.getNonNullableWorkspace();

    // The reinforcedSkillIds metadata field is a JSON array of skill sIds.
    // We use jsonb_exists to check if the skill sId is present in the array.
    const conditions: WhereOptions[] = [
      where(
        fn(
          "jsonb_extract_path_text",
          col("metadata"),
          REINFORCED_SKILLS_METADATA_KEYS.reinforcedSkills
        ),
        "true"
      ),
      where(
        fn(
          "jsonb_exists",
          fn(
            "jsonb_extract_path",
            col("metadata"),
            REINFORCED_SKILLS_METADATA_KEYS.reinforcedSkillIds
          ),
          skillId
        ),
        true
      ),
    ];

    const conversations = await ConversationModel.findAll({
      where: {
        workspaceId: workspace.id,
        ...(after ? { createdAt: { [Op.gte]: after } } : {}),
        [Op.and]: conditions,
      },
      order: [["createdAt", "DESC"]],
    });

    return conversations.map((c) => ({
      id: c.id,
      created: c.createdAt.getTime(),
      updated: c.updatedAt.getTime(),
      sId: c.sId,
      title: c.title,
      triggerId: ConversationResource.triggerIdToSId(c.triggerId, workspace.id),
      actionRequired: false,
      unread: false,
      lastReadMs: Date.now(),
      hasError: c.hasError,
      requestedSpaceIds: c.requestedSpaceIds.map(String),
      spaceId: null,
      depth: c.depth,
      metadata: c.metadata,
      isRunningAgentLoop: c.isRunningAgentLoop,
      isParticipant: false,
    }));
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

    // Update the conversation participant to set actionRequired to true.
    // Skip rows already at the target value to avoid a no-op row lock/write.
    const updated = await ConversationParticipantModel.update(
      { actionRequired: true },
      {
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user.id,
          actionRequired: { [Op.ne]: true },
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

    return this.clearActionRequiredForConversation(auth, conversation);
  }

  static async clearActionRequiredForConversation(
    auth: Authenticator,
    conversation: ConversationResource
  ) {
    // Skip rows already at the target value to avoid a no-op row lock/write.
    const updated = await ConversationParticipantModel.update(
      { actionRequired: false },
      {
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          actionRequired: { [Op.ne]: false },
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
    }: {
      conversation: ConversationWithoutContentType | ConversationResource;
      t?: Transaction;
    }
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

  static async setIsRunningAgentLoop(
    auth: Authenticator,
    {
      conversation,
      isRunningAgentLoop,
      transaction,
    }: {
      conversation: ConversationWithoutContentType;
      isRunningAgentLoop: boolean;
      transaction?: Transaction;
    }
  ) {
    const updated = await ConversationModel.update(
      { isRunningAgentLoop },
      {
        where: {
          id: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        // Do not update `updatedAt.
        silent: true,
        transaction,
      }
    );

    return new Ok(updated[0]);
  }

  static async markAsReadForAuthUser(
    auth: Authenticator,
    {
      conversation,
      transaction,
      lastReadAt,
    }: {
      conversation: ConversationWithoutContentType | ConversationResource;
      transaction?: Transaction;
      // Optional override; defaults to now. Callers can pass a timestamp in the
      // future to keep the conversation marked as read through an imminent
      // `markAsUpdated` bump (e.g. a static agent reply that the user just
      // triggered and does not need to be re-notified about).
      lastReadAt?: Date;
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
        lastReadAt: lastReadAt ?? new Date(),
      },
      { transaction }
    );

    return new Ok(updated);
  }

  /**
   * Marks the conversation as read for every participant. Used for
   * notification-style conversations once their purpose is fulfilled (e.g. all
   * skill suggestions handled), so the remaining participants are not notified
   * about an already-handled conversation.
   */
  static async markAsReadForAllParticipants(
    auth: Authenticator,
    {
      conversation,
      lastReadAt,
    }: {
      conversation: ConversationWithoutContentType | ConversationResource;
      lastReadAt?: Date;
    }
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const participants = await ConversationParticipantModel.findAll({
      where: {
        workspaceId,
        conversationId: conversation.id,
      },
      attributes: ["userId"],
    });

    if (participants.length === 0) {
      return;
    }

    await UserConversationReadsModel.bulkCreate(
      participants.map((p) => ({
        conversationId: conversation.id,
        userId: p.userId,
        workspaceId,
        lastReadAt: lastReadAt ?? new Date(),
      })),
      { updateOnDuplicate: ["lastReadAt"] }
    );
  }

  static async markAsUnreadForAuthUser(
    auth: Authenticator,
    {
      conversation,
    }: {
      conversation: ConversationWithoutContentType | ConversationResource;
    }
  ) {
    if (!auth.user()) {
      return new Err(new Error("user_not_authenticated"));
    }
    await UserConversationReadsModel.destroy({
      where: {
        conversationId: conversation.id,
        userId: auth.getNonNullableUser().id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return new Ok(undefined);
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

  /**
   * Filters the provided conversations to those "visible" to the current user.
   *
   * A conversation is visible when:
   *   - It is a private conversation (spaceId = null) where the user is a participant
   *     (same rules as `fetchPrivateConversationsPaginated`), or
   *   - It lives in a project space where the user is a member
   *     (same rules as `listConversationsInSpacePaginated`).
   *
   * Returns the visible subset of the input conversations.
   */
  static async filterVisibleConversations(
    auth: Authenticator,
    conversations: ConversationResource[]
  ): Promise<ConversationResource[]> {
    const user = auth.user();
    if (!user || conversations.length === 0) {
      return [];
    }

    const modelIds = conversations.map((c) => c.id);
    const visibleModelIds = new Set<ModelId>();

    // 1. Private conversations (spaceId = null): visible if user is participant.
    const { conversations: privateConvs } =
      await this.fetchPrivateConversationsPaginated(auth, {
        // limit page size to the number of convs we are searching for to have a single page
        pagination: { limit: modelIds.length },
        restrictToConversationModelIds: modelIds,
      });
    for (const c of privateConvs) {
      visibleModelIds.add(c.id);
    }

    // 2. Space conversations: visible if in a project space where user is member.
    const uniqueSpaceIds = uniq(
      conversations
        .map((c) => c.spaceId)
        .filter((id): id is number => id !== null)
    );

    if (uniqueSpaceIds.length > 0) {
      const spaces = await SpaceResource.fetchByModelIds(auth, uniqueSpaceIds);
      const spacesByModelId = new Map(spaces.map((s) => [s.id, s]));

      for (const c of conversations) {
        if (c.spaceId !== null) {
          const space = spacesByModelId.get(c.spaceId);
          // This almost replicates what we have in baseFetchWithAuthorization or canAccess.
          // But with a slight difference: we do not only check if the space is readable by the auth.
          // We check if the space is project (pod) and auth is a member.
          // Theses are the same conversations as the ones that would be listed in the sidebar.
          if (space && space.isProject() && space.isMember(auth)) {
            visibleModelIds.add(c.id);
          }
        }
      }
    }

    return conversations.filter((c) => visibleModelIds.has(c.id));
  }

  static async isConversationParticipant(
    auth: Authenticator,
    {
      conversation,
      user,
      transaction,
    }: {
      conversation: ConversationWithoutContentType | ConversationResource;
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
      conversation: ConversationWithoutContentType | ConversationResource;
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
   * Resolve the parent agent message that spawned the given agent message in
   * this conversation via run_agent / agent_handover.
   *
   * Walks the agent message → its parent user message (in the same conversation)
   * → that user message's `agenticOriginMessageId` (the parent agent message,
   * possibly in another conversation).
   *
   * Returns null when the agent message has no agentic origin (root
   * conversation) or when the parent message can no longer be found.
   */
  async findAgenticParent(
    auth: Authenticator,
    { agentMessageId }: { agentMessageId: string }
  ): Promise<{
    agentConfigurationId: string;
    agentMessageId: string;
    conversationModelId: ModelId;
  } | null> {
    const owner = auth.getNonNullableWorkspace();

    const agentMessage = await MessageModel.findOne({
      where: {
        workspaceId: owner.id,
        conversationId: this.id,
        sId: agentMessageId,
      },
      attributes: ["parentId"],
    });

    if (!agentMessage?.parentId) {
      return null;
    }

    const parentMessage = await MessageModel.findOne({
      where: {
        workspaceId: owner.id,
        conversationId: this.id,
        id: agentMessage.parentId,
      },
      attributes: [],
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: true,
          attributes: ["agenticOriginMessageId"],
        },
      ],
    });

    const agenticOriginMessageId =
      parentMessage?.userMessage?.agenticOriginMessageId;
    if (!agenticOriginMessageId) {
      return null;
    }

    const agenticOriginMessage = await MessageModel.findOne({
      where: {
        workspaceId: owner.id,
        sId: agenticOriginMessageId,
      },
      attributes: ["sId", "conversationId"],
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          attributes: ["agentConfigurationId"],
        },
      ],
    });

    if (!agenticOriginMessage?.agentMessage) {
      return null;
    }

    return {
      agentConfigurationId:
        agenticOriginMessage.agentMessage.agentConfigurationId,
      agentMessageId: agenticOriginMessage.sId,
      conversationModelId: agenticOriginMessage.conversationId,
    };
  }

  static async findRootAgentMessageId(
    auth: Authenticator,
    { agentMessageId }: { agentMessageId: string }
  ): Promise<string> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    let rootAgentMessageId = agentMessageId;

    for (let depth = 0; depth <= MAX_CONVERSATION_DEPTH; depth++) {
      const agentMessage = await MessageModel.findOne({
        attributes: ["parentId"],
        where: { workspaceId, sId: rootAgentMessageId },
        order: [["version", "DESC"]],
      });
      if (!agentMessage?.parentId) {
        return rootAgentMessageId;
      }

      const triggeringMessage = await MessageModel.findOne({
        attributes: [],
        where: { workspaceId, id: agentMessage.parentId },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: true,
            attributes: ["agenticOriginMessageId"],
          },
        ],
      });
      const agenticOriginMessageId =
        triggeringMessage?.userMessage?.agenticOriginMessageId;
      if (!agenticOriginMessageId) {
        return rootAgentMessageId;
      }

      rootAgentMessageId = agenticOriginMessageId;
    }

    return rootAgentMessageId;
  }

  /**
   * Get the latest agent message id by rank for a given conversation.
   * @returns The latest agent message id, version and rank.
   */
  static async getLatestAgentMessageIdByRank(
    auth: Authenticator,
    { conversationId }: { conversationId: ModelId }
  ): Promise<
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
        conversationId,
      },
    });

    return results;
  }

  /**
   * Returns true when the conversation view contains a user message (latest version
   * per rank) authored by someone other than `excludeUserId`.
   */
  async hasUserMessageFromOtherUser(
    auth: Authenticator,
    {
      excludeUserId,
      transaction,
    }: {
      excludeUserId?: ModelId | null;
      transaction?: Transaction;
    } = {}
  ): Promise<boolean> {
    const owner = auth.getNonNullableWorkspace();

    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM (
          SELECT DISTINCT ON (m.rank) um."userId"
          FROM messages m
          INNER JOIN user_messages um
            ON um.id = m."userMessageId"
            AND um."workspaceId" = m."workspaceId"
            AND um."conversationId" = m."conversationId"
          WHERE m."workspaceId" = :workspaceId
            AND m."conversationId" = :conversationId
            AND m.visibility != 'deleted'
            AND m."userMessageId" IS NOT NULL
            AND um."userId" IS NOT NULL
          ORDER BY m.rank ASC, m.version DESC
        ) latest
        WHERE latest."userId" IS NOT NULL
          AND (:excludeUserId IS NULL OR latest."userId" != :excludeUserId)
      ) AS "exists"
    `;

    // biome-ignore lint/plugin/noRawSql: EXISTS subquery with DISTINCT ON
    const [result] = await frontSequelize.query<{ exists: boolean }>(query, {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId: owner.id,
        conversationId: this.id,
        excludeUserId: excludeUserId ?? null,
      },
      transaction,
    });

    return result?.exists ?? false;
  }

  /**
   * Returns true when the conversation view has an agent message (latest version
   * per rank) at a rank strictly greater than `afterRank`.
   */
  async hasAgentMessageAfterRank(
    auth: Authenticator,
    {
      afterRank,
      transaction,
    }: {
      afterRank: number;
      transaction?: Transaction;
    }
  ): Promise<boolean> {
    const owner = auth.getNonNullableWorkspace();

    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM (
          SELECT DISTINCT ON (m.rank) m."agentMessageId"
          FROM messages m
          WHERE m."workspaceId" = :workspaceId
            AND m."conversationId" = :conversationId
            AND m.visibility != 'deleted'
            AND m.rank > :afterRank
          ORDER BY m.rank ASC, m.version DESC
        ) latest
        WHERE latest."agentMessageId" IS NOT NULL
      ) AS "exists"
    `;

    // biome-ignore lint/plugin/noRawSql: EXISTS subquery with DISTINCT ON
    const [result] = await frontSequelize.query<{ exists: boolean }>(query, {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId: owner.id,
        conversationId: this.id,
        afterRank,
      },
      transaction,
    });

    return result?.exists ?? false;
  }

  async getLatestUserMessageModelAtRank(
    auth: Authenticator,
    {
      rank,
      transaction,
    }: {
      rank: number;
      transaction?: Transaction;
    }
  ): Promise<MessageModel | null> {
    const owner = auth.getNonNullableWorkspace();

    return MessageModel.findOne({
      where: {
        workspaceId: owner.id,
        conversationId: this.id,
        rank,
        visibility: { [Op.ne]: "deleted" },
      },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: true,
        },
      ],
      order: [["version", "DESC"]],
      transaction,
    });
  }

  /**
   * Returns the context to carry over to a wake-up run: the client-side MCP servers and the
   * model explicitly requested on the latest non wake-up user message of the conversation. This
   * anchors wake-ups on the last human turn so they keep running with the model the user picked
   * rather than falling back to the agent's configured model.
   */
  async getContextFromLatestNonWakeUpUserMessage(
    auth: Authenticator,
    {
      transaction,
    }: {
      transaction?: Transaction;
    } = {}
  ): Promise<{
    clientSideMCPServerIds: string[];
    requestedProviderId: string | null;
    requestedModelId: string | null;
    requestedReasoningEffort: string | null;
  }> {
    const owner = auth.getNonNullableWorkspace();

    const query = `
      SELECT
        latest."clientSideMCPServerIds",
        latest."requestedProviderId",
        latest."requestedModelId",
        latest."requestedReasoningEffort"
      FROM (
        SELECT DISTINCT ON (m.rank)
          m.rank,
          um."userContextOrigin",
          um."clientSideMCPServerIds",
          um."requestedProviderId",
          um."requestedModelId",
          um."requestedReasoningEffort"
        FROM messages m
        INNER JOIN user_messages um
          ON um.id = m."userMessageId"
          AND um."workspaceId" = m."workspaceId"
          AND um."conversationId" = m."conversationId"
        WHERE m."workspaceId" = :workspaceId
          AND m."conversationId" = :conversationId
          AND m.visibility != 'deleted'
          AND m."userMessageId" IS NOT NULL
        ORDER BY m.rank ASC, m.version DESC
      ) latest
      WHERE latest."userContextOrigin" != 'wakeup'
      ORDER BY latest.rank DESC
      LIMIT 1
    `;

    // biome-ignore lint/plugin/noRawSql: DISTINCT ON subquery with LIMIT 1
    const [result] = await frontSequelize.query<{
      clientSideMCPServerIds: string[] | null;
      requestedProviderId: string | null;
      requestedModelId: string | null;
      requestedReasoningEffort: string | null;
    }>(query, {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId: owner.id,
        conversationId: this.id,
      },
      transaction,
    });

    return {
      clientSideMCPServerIds: result?.clientSideMCPServerIds ?? [],
      requestedProviderId: result?.requestedProviderId ?? null,
      requestedModelId: result?.requestedModelId ?? null,
      requestedReasoningEffort: result?.requestedReasoningEffort ?? null,
    };
  }

  /**
   * Returns the latest message row per rank for consecutive agent-message ranks
   * immediately following `afterRank`, stopping at the first non-agent rank.
   * Includes already-deleted agent placeholders (caller filters for cascade).
   */
  async getConsecutiveAgentReplyModelsAfterRank(
    auth: Authenticator,
    {
      afterRank,
      transaction,
    }: {
      afterRank: number;
      transaction?: Transaction;
    }
  ): Promise<MessageModel[]> {
    const owner = auth.getNonNullableWorkspace();

    const query = `
      SELECT DISTINCT ON (m.rank)
        m.id,
        m.rank,
        m."agentMessageId"
      FROM messages m
      WHERE m."workspaceId" = :workspaceId
        AND m."conversationId" = :conversationId
        AND m.rank > :afterRank
      ORDER BY m.rank ASC, m.version DESC
    `;

    // biome-ignore lint/plugin/noRawSql: DISTINCT ON for latest version per rank
    const latestPerRank = await frontSequelize.query<{
      id: ModelId;
      rank: number;
      agentMessageId: ModelId | null;
    }>(query, {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId: owner.id,
        conversationId: this.id,
        afterRank,
      },
      transaction,
    });

    const consecutiveMessageIds: ModelId[] = [];
    for (const row of latestPerRank) {
      if (!row.agentMessageId) {
        break;
      }
      consecutiveMessageIds.push(row.id);
    }

    if (consecutiveMessageIds.length === 0) {
      return [];
    }

    return MessageModel.findAll({
      where: {
        id: { [Op.in]: consecutiveMessageIds },
        workspaceId: owner.id,
        conversationId: this.id,
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: false,
        },
      ],
      order: [["rank", "ASC"]],
      transaction,
    });
  }

  /**
   * Finds an in-flight agent reply using only the latest message version at each
   * rank. Soft-delete writes a newer `visibility: "deleted"` placeholder while the
   * older row can remain `status: "created"`; scanning historical versions would
   * incorrectly treat that deleted turn as still running (see #29418).
   */
  async getRunningAgentMessage(
    auth: Authenticator,
    {
      transaction,
    }: {
      transaction?: Transaction;
    } = {}
  ): Promise<RunningAgentMessageContext | null> {
    const owner = auth.getNonNullableWorkspace();

    const query = `
      SELECT
        latest."sId",
        latest.rank,
        am.id AS "agentMessageId",
        am."agentConfigurationId"
      FROM (
        SELECT DISTINCT ON (m.rank)
          m."sId",
          m.rank,
          m.visibility,
          m."agentMessageId"
        FROM messages m
        WHERE m."workspaceId" = :workspaceId
          AND m."conversationId" = :conversationId
        ORDER BY m.rank DESC, m.version DESC
      ) latest
      INNER JOIN agent_messages am
        ON am.id = latest."agentMessageId"
        AND am."workspaceId" = :workspaceId
        AND am."conversationId" = :conversationId
      WHERE latest.visibility != 'deleted'
        AND am.status = 'created'
      ORDER BY latest.rank DESC
      LIMIT 1
    `;

    // biome-ignore lint/plugin/noRawSql: DISTINCT ON latest version per rank
    const [message] = await frontSequelize.query<{
      sId: string;
      rank: number;
      agentMessageId: number;
      agentConfigurationId: string;
    }>(query, {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId: owner.id,
        conversationId: this.id,
      },
      transaction,
    });

    if (!message) {
      return null;
    }

    return {
      sId: message.sId,
      agentMessageId: message.agentMessageId,
      agentConfigurationId: message.agentConfigurationId,
      rank: message.rank,
    };
  }

  async getRunningCompactionMessage(
    auth: Authenticator,
    {
      transaction,
    }: {
      transaction?: Transaction;
    } = {}
  ): Promise<RunningCompactionMessageContext | null> {
    const owner = auth.getNonNullableWorkspace();
    const message = await MessageModel.findOne({
      attributes: ["sId", "rank"],
      where: {
        workspaceId: owner.id,
        conversationId: this.id,
        visibility: { [Op.ne]: "deleted" },
      },
      include: [
        {
          model: CompactionMessageModel,
          as: "compactionMessage",
          required: true,
          attributes: ["id"],
          where: {
            status: "created",
            conversationId: this.id,
            workspaceId: owner.id,
          },
        },
      ],
      order: [
        ["rank", "DESC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    if (!message) {
      return null;
    }

    return {
      sId: message.sId,
      rank: message.rank,
    };
  }

  async getInFlightMessages(
    auth: Authenticator,
    {
      transaction,
    }: {
      transaction?: Transaction;
    } = {}
  ): Promise<{
    runningAgentMessage: RunningAgentMessageContext | null;
    runningCompactionMessage: RunningCompactionMessageContext | null;
  }> {
    const [runningAgentMessage, runningCompactionMessage] = await Promise.all([
      this.getRunningAgentMessage(auth, { transaction }),
      this.getRunningCompactionMessage(auth, { transaction }),
    ]);

    return { runningAgentMessage, runningCompactionMessage };
  }

  async getBranchCreationContext(
    auth: Authenticator,
    {
      transaction,
    }: {
      transaction?: Transaction;
    } = {}
  ): Promise<BranchCreationContext> {
    const owner = auth.getNonNullableWorkspace();

    const query = `
      WITH latest AS (
        SELECT DISTINCT ON (rank) id, rank, "contentFragmentId"
        FROM messages
        WHERE "workspaceId" = :workspaceId
          AND "conversationId" = :conversationId
          AND visibility != 'deleted'
        ORDER BY rank ASC, version DESC
      )
      SELECT
        COUNT(*)::int AS "messageCount",
        COUNT(*) FILTER (WHERE "contentFragmentId" IS NULL)::int AS "nonContentFragmentCount",
        MAX(rank) AS "maxRank",
        (ARRAY_AGG(id ORDER BY rank DESC))[1] AS "lastMessageId",
        MAX(rank) AS "lastMessageRank"
      FROM latest
    `;

    // biome-ignore lint/plugin/noRawSql: DISTINCT ON aggregate for branch creation
    const [stats] = await frontSequelize.query<{
      messageCount: number;
      nonContentFragmentCount: number;
      maxRank: number | null;
      lastMessageId: ModelId | null;
      lastMessageRank: number | null;
    }>(query, {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId: owner.id,
        conversationId: this.id,
      },
      transaction,
    });

    if (!stats || stats.messageCount === 0) {
      return {
        isEmpty: true,
        onlyContentFragments: false,
        maxRank: null,
        lastMessage: null,
      };
    }

    return {
      isEmpty: false,
      onlyContentFragments: stats.nonContentFragmentCount === 0,
      maxRank: stats.maxRank,
      lastMessage:
        stats.lastMessageId !== null && stats.lastMessageRank !== null
          ? { id: stats.lastMessageId, rank: stats.lastMessageRank }
          : null,
    };
  }

  /**
   * Latest-version message at the highest rank in the conversation view.
   */
  async getLatestMessageSummary(
    auth: Authenticator,
    {
      transaction,
    }: {
      transaction?: Transaction;
    } = {}
  ): Promise<LatestMessageSummary | null> {
    const owner = auth.getNonNullableWorkspace();

    const message = await MessageModel.findOne({
      attributes: ["sId", "rank", "compactionMessageId"],
      where: {
        workspaceId: owner.id,
        conversationId: this.id,
        visibility: { [Op.ne]: "deleted" },
      },
      include: [
        {
          model: CompactionMessageModel,
          as: "compactionMessage",
          required: false,
          attributes: ["status"],
        },
      ],
      order: [
        ["rank", "DESC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    if (!message) {
      return null;
    }

    return {
      sId: message.sId,
      rank: message.rank,
      compactionStatus: message.compactionMessage?.status ?? null,
    };
  }

  async getLatestAgentMessageIdByRank(auth: Authenticator): Promise<
    {
      rank: number;
      agentMessageId: number;
      version: number;
    }[]
  > {
    return ConversationResource.getLatestAgentMessageIdByRank(auth, {
      conversationId: this.id,
    });
  }

  async getMessageById(
    auth: Authenticator,
    messageId: string,
    version?: number
  ): Promise<Result<MessageModel, Error>> {
    return ConversationResource.getMessageByIdInConversation(
      auth,
      this.toJSON(),
      messageId,
      version
    );
  }

  static async getPendingUserMessagesInConversation(
    auth: Authenticator,
    {
      conversation,
      transaction,
    }: {
      conversation: ConversationWithoutContentType;
      transaction?: Transaction;
    }
  ): Promise<MessageModel[]> {
    const owner = auth.getNonNullableWorkspace();
    const pendingMessages = await MessageModel.findAll({
      where: {
        conversationId: conversation.id,
        workspaceId: owner.id,
        visibility: "pending",
      },
      include: [
        { model: UserMessageModel, as: "userMessage", required: false },
      ],
      order: [["rank", "ASC"]],
      transaction,
    });

    return pendingMessages;
  }

  static async hasMessageForContentFragmentSeries(
    auth: Authenticator,
    {
      conversation,
      contentFragmentId,
      contentFragmentVersion,
      transaction,
    }: {
      conversation: ConversationWithoutContentType;
      contentFragmentId: string;
      contentFragmentVersion?: ContentFragmentVersion;
      transaction?: Transaction;
    }
  ): Promise<boolean> {
    const owner = auth.getNonNullableWorkspace();
    const where: WhereOptions<MessageModel> = {
      conversationId: conversation.id,
      workspaceId: owner.id,
    };

    const message = await MessageModel.findOne({
      attributes: ["id"],
      where,
      include: [
        {
          model: ContentFragmentModel,
          as: "contentFragment",
          attributes: [],
          required: true,
          where: {
            workspaceId: owner.id,
            sId: contentFragmentId,
            ...(contentFragmentVersion
              ? { version: contentFragmentVersion }
              : {}),
          },
        },
      ],
      transaction,
    });

    return !!message;
  }

  static async updateCompactionMessageRunIds(
    auth: Authenticator,
    {
      compactionMessageModelId,
      runIds,
    }: {
      compactionMessageModelId: ModelId;
      runIds: string[];
    }
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const sanitizedRunIds = runIds.map((runId) => runId.replaceAll("'", "''"));

    await CompactionMessageModel.update(
      {
        runIds: fn(
          "ARRAY",
          literal(
            `SELECT DISTINCT unnest(COALESCE("runIds", '{}') || ARRAY['${sanitizedRunIds.join("','")}']::text[])`
          )
        ),
      },
      {
        where: {
          id: compactionMessageModelId,
          workspaceId,
        },
      }
    );
  }

  // Return the latest run from a successful compaction message.
  async getLatestCompactionMessageRun(
    auth: Authenticator
  ): Promise<{ rank: number; run: RunResource } | null> {
    const owner = auth.getNonNullableWorkspace();

    const message = await MessageModel.findOne({
      where: {
        conversationId: this.id,
        workspaceId: owner.id,
      },
      include: [
        {
          model: CompactionMessageModel,
          as: "compactionMessage",
          required: true,
          where: {
            status: "succeeded",
          },
        },
      ],
      order: [["rank", "DESC"]],
    });

    if (!message?.compactionMessage?.runIds?.length) {
      return null;
    }

    // The runIds array ordering is not guaranteed to be chronological. Fetch all runs and pick
    // the most recently created one.
    const runs = await RunResource.listByDustRunIds(auth, {
      dustRunIds: message.compactionMessage.runIds,
    });

    if (runs.length === 0) {
      return null;
    }

    return {
      rank: message.rank,
      run: runs.reduce((latest, r) =>
        r.createdAt > latest.createdAt ? r : latest
      ),
    };
  }

  // Return the latest run from an agent message. We accept all statuses as they all have valid
  // runIds that represent the actual latest run.
  async getLatestAgentMessageRun(
    auth: Authenticator,
    {
      maxRank,
      transaction,
    }: {
      maxRank?: number;
      transaction?: Transaction;
    } = {}
  ): Promise<{ rank: number; run: RunResource } | null> {
    const owner = auth.getNonNullableWorkspace();
    const where: WhereOptions<MessageModel> = {
      conversationId: this.id,
      workspaceId: owner.id,
      ...(maxRank !== undefined ? { rank: { [Op.lte]: maxRank } } : {}),
    };

    const message = await MessageModel.findOne({
      where,
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
        },
      ],
      order: [
        ["rank", "DESC"],
        ["version", "DESC"],
      ],
      transaction,
    });

    if (!message?.agentMessage?.runIds?.length) {
      return null;
    }

    // The runIds array ordering is not guaranteed to be chronological. Fetch all runs and pick
    // the most recently created one.
    const runs = await RunResource.listByDustRunIds(auth, {
      dustRunIds: message.agentMessage.runIds,
    });

    if (runs.length === 0) {
      return null;
    }

    return {
      rank: message.rank,
      run: runs.reduce((latest, r) =>
        r.createdAt > latest.createdAt ? r : latest
      ),
    };
  }

  static async resolveForkSourceMessage(
    auth: Authenticator,
    {
      conversationId,
      sourceMessageId,
      transaction,
    }: {
      conversationId: ModelId;
      sourceMessageId?: string;
      transaction?: Transaction;
    }
  ): Promise<Result<MessageModel, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const where: WhereOptions<MessageModel> = {
      workspaceId,
      conversationId,
      visibility: { [Op.ne]: "deleted" },
      agentMessageId: { [Op.ne]: null },
    };

    if (sourceMessageId) {
      where.sId = sourceMessageId;
    }

    // Keep the lookup scoped to a single conversation/workspace; ordering by rank/version only
    // applies within that slice when choosing the latest main-thread agent message.
    const sourceMessage = await MessageModel.findOne({
      where,
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          attributes: ["status", "updatedAt"],
          where: {
            status: { [Op.ne]: "created" },
          },
        },
      ],
      order: sourceMessageId
        ? undefined
        : [
            ["rank", "DESC"],
            ["version", "DESC"],
          ],
      transaction,
    });

    if (!sourceMessage) {
      return new Err(
        new Error(
          sourceMessageId
            ? "The source message is missing or cannot be used for forking."
            : "The conversation has no completed agent message to fork from."
        )
      );
    }

    return new Ok(sourceMessage);
  }

  static async getMessageByIdInConversation(
    auth: Authenticator,
    conversation: ConversationWithoutContentType,
    messageId: string,
    version?: number
  ): Promise<Result<MessageModel, Error>> {
    const message = await MessageModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: messageId,
        ...(version ? { version } : {}),
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

  static async getMessageByIds(
    auth: Authenticator,
    conversation: ConversationWithoutContentType | ConversationResource,
    messageIds: string[]
  ): Promise<MessageModel[]> {
    return MessageModel.findAll({
      where: {
        conversationId: conversation.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: { [Op.in]: messageIds },
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

    // The include.where lands in the LEFT JOIN ON clause (required: false keeps the OUTER join),
    // letting the planner use the side tables' (workspaceId, conversationId) indexes instead of
    // one PK probe per message. Relies on conversationId being backfilled on side tables.
    const sideTableWhere = {
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId: this.id,
    };
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
          where: sideTableWhere,
        },
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: false,
          where: sideTableWhere,
        },
        // We skip ContentFragmentResource here for efficiency reasons (retrieving contentFragments
        // along with messages in one query). Only once we move to a MessageResource will we be able
        // to properly abstract this.
        {
          model: ContentFragmentModel,
          as: "contentFragment",
          required: false,
          where: sideTableWhere,
        },
        {
          model: CompactionMessageModel,
          as: "compactionMessage",
          required: false,
          where: sideTableWhere,
        },
      ],
    });

    return {
      hasMore,
      messages,
    };
  }

  /**
   * Fetch message rows (with side-table includes) by model ids, ordered by rank/version ASC.
   */
  async fetchMessagesByModelIds(
    auth: Authenticator,
    messageIds: ModelId[]
  ): Promise<MessageModel[]> {
    if (messageIds.length === 0) {
      return [];
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    const sideTableWhere = {
      workspaceId,
      conversationId: this.id,
    };

    return MessageModel.findAll({
      where: {
        conversationId: this.id,
        workspaceId,
        id: { [Op.in]: messageIds },
      },
      order: [
        ["rank", "ASC"],
        ["version", "ASC"],
      ],
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: false,
          where: sideTableWhere,
        },
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: false,
          where: sideTableWhere,
        },
        {
          model: ContentFragmentModel,
          as: "contentFragment",
          required: false,
          where: sideTableWhere,
        },
        {
          model: CompactionMessageModel,
          as: "compactionMessage",
          required: false,
          where: sideTableWhere,
        },
      ],
    });
  }

  /**
   * Message ids that are unread for the given lastReadAt.
   * Unread = created after lastRead, or agent message completed after lastRead.
   * When lastReadAt is null, every main-branch message is unread.
   */
  async fetchUnreadMessageIds(
    auth: Authenticator,
    lastReadAt: Date | null
  ): Promise<ModelId[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const baseWhere: WhereOptions<MessageModel> = {
      workspaceId,
      conversationId: this.id,
    };

    if (lastReadAt === null) {
      const messages = await MessageModel.findAll({
        attributes: ["id"],
        where: baseWhere,
      });
      return messages.map((message) => message.id);
    }

    const [createdAfter, completedAfter] = await Promise.all([
      MessageModel.findAll({
        attributes: ["id"],
        where: {
          ...baseWhere,
          createdAt: { [Op.gt]: lastReadAt },
        },
      }),
      MessageModel.findAll({
        attributes: ["id"],
        where: baseWhere,
        include: [
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: true,
            attributes: [],
            where: {
              workspaceId,
              conversationId: this.id,
              completedAt: { [Op.gt]: lastReadAt },
            },
          },
        ],
      }),
    ]);

    return [
      ...new Set([
        ...createdAfter.map((message) => message.id),
        ...completedAfter.map((message) => message.id),
      ]),
    ];
  }

  /**
   * Latest version message id per rank, earliest ranks first.
   * Used to find the first visible message without loading the full conversation.
   */
  async fetchEarliestLatestVersionMessageIds(
    auth: Authenticator,
    { limit }: { limit: number }
  ): Promise<ModelId[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const rankRows = await MessageModel.findAll({
      attributes: [
        [Sequelize.fn("MAX", Sequelize.col("version")), "maxVersion"],
        [Sequelize.fn("MAX", Sequelize.col("id")), "id"],
        [Sequelize.fn("MAX", Sequelize.col("rank")), "rank"],
      ],
      where: {
        workspaceId,
        conversationId: this.id,
        visibility: { [Op.ne]: "deleted" },
      },
      group: ["rank"],
      order: [["rank", "ASC"]],
      limit,
    });

    return rankRows.map((row) => row.id);
  }

  static async updateRequirements(
    auth: Authenticator,
    sId: string,
    requestedSpaceIds: number[],
    transaction?: Transaction
  ) {
    const conversation = await ConversationResource.fetchById(auth, sId, {
      transaction,
    });
    if (conversation === null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    await conversation.updateRequirements(auth, requestedSpaceIds, transaction);
    return new Ok(undefined);
  }

  /**
   * Atomically merges `spaceModelIds` into the conversation requirements and returns the resulting
   * requirement set (as space sIds).
   *
   * `requestedSpaceIds` is a conjunctive ACL: a viewer must have read access to every listed Space.
   * Computing the union from a caller-held snapshot lets two overlapping requests overwrite each
   * other, which would leave a Space materialized in the agent runtime scope with no matching ACL
   * requirement. The merge therefore has to happen against locked, current state.
   */
  static async appendRequestedSpaceIds(
    auth: Authenticator,
    sId: string,
    spaceModelIds: ModelId[],
    transaction: Transaction
  ): Promise<Result<string[], ConversationError>> {
    const conversation = await ConversationResource.fetchById(auth, sId, {
      transaction,
    });
    if (conversation === null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    return conversation.appendRequestedSpaceIds(
      auth,
      spaceModelIds,
      transaction
    );
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

  static async updateUrlAccessMode(
    auth: Authenticator,
    sId: string,
    accessMode: ConversationUrlAccessMode,
    transaction?: Transaction
  ) {
    const conversation = await this.fetchById(auth, sId);
    if (conversation == null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    const metadata: ConversationMetadata = {
      ...conversation.metadata,
      urlAccessMode: accessMode,
    };

    await conversation.update({ metadata }, transaction);

    return new Ok(undefined);
  }

  /** Copies the filesystem choice to a fresh standalone child conversation. */
  static async inheritDatabaseFileSystem(
    auth: Authenticator,
    sId: string
  ): Promise<Result<undefined, Error>> {
    const conversation = await this.fetchById(auth, sId);
    if (!conversation) {
      return new Err(new ConversationError("conversation_not_found"));
    }
    if (conversation.spaceId !== null) {
      return new Err(
        new Error("Pod conversations inherit their Pod filesystem.")
      );
    }

    await conversation.update({
      metadata: {
        ...conversation.metadata,
        useDatabaseFileSystem: true,
      },
    });
    return new Ok(undefined);
  }

  static async fetchMCPServerViews(
    auth: Authenticator,
    conversation: ConversationWithoutContentType | ConversationResource,
    {
      onlyEnabled,
      agentConfigurationId,
    }: { onlyEnabled?: boolean; agentConfigurationId?: string | null } = {}
  ): Promise<ConversationMCPServerViewType[]> {
    // Build the agentConfigurationId filter:
    // - undefined (no agent context, e.g. UI listing): only conversation-scope rows (null).
    // - string or null explicitly provided: return both agent-specific and conversation-wide rows.
    const agentConfigFilter =
      agentConfigurationId !== undefined
        ? {
            [Op.or]: [{ agentConfigurationId }, { agentConfigurationId: null }],
          }
        : { agentConfigurationId: null };

    const conversationMCPServerViews =
      await ConversationMCPServerViewModel.findAll({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          ...(onlyEnabled ? { enabled: true } : {}),
          ...agentConfigFilter,
        },
      });

    return conversationMCPServerViews.map(
      (view): ConversationMCPServerViewType => {
        const base = {
          id: view.id,
          workspaceId: view.workspaceId,
          conversationId: view.conversationId,
          mcpServerViewId: view.mcpServerViewId,
          userId: view.userId,
          enabled: view.enabled,
          createdAt: view.createdAt,
          updatedAt: view.updatedAt,
        };

        if (view.source === "agent_enabled" && view.agentConfigurationId) {
          return {
            ...base,
            source: "agent_enabled",
            agentConfigurationId: view.agentConfigurationId,
          };
        }

        return {
          ...base,
          source: "conversation",
          agentConfigurationId: null,
        };
      }
    );
  }

  static async upsertMCPServerViews(
    auth: Authenticator,
    {
      conversation,
      mcpServerViews,
      enabled,
      source,
      agentConfigurationId,
      transaction,
    }: {
      conversation: ConversationWithoutContentType | ConversationResource;
      mcpServerViews: MCPServerViewResource[];
      enabled: boolean;
      transaction?: Transaction;
    } & (
      | { source: "agent_enabled"; agentConfigurationId: string }
      | { source: "conversation"; agentConfigurationId: null }
    )
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

    // Query directly with an exact agentConfigurationId match. fetchMCPServerViews
    // uses Op.or (agent-specific + conversation-wide) which is the wrong semantic here.
    const existingConversationMCPServerViews =
      await ConversationMCPServerViewModel.findAll({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversation.id,
          agentConfigurationId: agentConfigurationId ?? null,
        },
        transaction,
      });
    const userId = auth.user()?.id ?? null;

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
            source,
            userId,
            updatedAt: new Date(),
          },
          {
            where: {
              id: existingConversationMCPServerView.id,
              workspaceId: auth.getNonNullableWorkspace().id,
              conversationId: conversation.id,
            },
            transaction,
          }
        );
      } else {
        await ConversationMCPServerViewModel.create(
          {
            conversationId: conversation.id,
            workspaceId: auth.getNonNullableWorkspace().id,
            mcpServerViewId: mcpServerView.id,
            userId,
            enabled,
            source,
            agentConfigurationId,
          },
          { transaction }
        );
      }
    }

    return new Ok(undefined);
  }

  async updateTitle(auth: Authenticator, title: string) {
    await this.update({ title });
  }

  async updateVisibilityToDeleted(auth: Authenticator) {
    await this.update({ visibility: "deleted" });
  }

  async updateVisibilityToUnlisted(auth: Authenticator) {
    await this.update({ visibility: "unlisted" });
  }

  async updateRequirements(
    auth: Authenticator,
    requestedSpaceIds: number[],
    transaction?: Transaction
  ) {
    await this.update(
      {
        requestedSpaceIds: uniq(requestedSpaceIds),
      },
      transaction
    );
  }

  /**
   * See {@link ConversationResource.appendRequestedSpaceIds}. The conversation row is re-read with
   * `SELECT ... FOR UPDATE` inside the caller transaction, so concurrent appends serialize on the
   * row instead of each writing the union of its own stale snapshot.
   */
  async appendRequestedSpaceIds(
    auth: Authenticator,
    spaceModelIds: ModelId[],
    transaction: Transaction
  ): Promise<Result<string[], ConversationError>> {
    const lockedConversation = await ConversationResource.model.findOne({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (lockedConversation === null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    await this.updateRequirements(
      auth,
      [...lockedConversation.requestedSpaceIds, ...spaceModelIds],
      transaction
    );

    // `update` refreshes the instance from the `RETURNING` row, so this is the persisted value.
    return new Ok(this.getRequestedSpaceIdsFromModel());
  }

  isPodConversation() {
    return this.spaceId !== null;
  }

  get spaceSId(): string | null {
    return this.spaceId
      ? SpaceResource.modelIdToSId({
          id: this.spaceId,
          workspaceId: this.workspaceId,
        })
      : null;
  }

  async updateSpaceId(
    auth: Authenticator,
    space: SpaceResource | null,
    transaction?: Transaction
  ) {
    await this.update({ spaceId: space?.id ?? null }, transaction);
    // TODO(2026-04-30): BaseResource.update does not reload joins, so we
    // manually refresh the space here.
    this._space = space;
  }

  /**
   * Get the distinct agent configuration IDs and content fragment DataSourceView ids
   * used in this conversation. This data is needed to rebuild the conversation's
   * requestedSpaceIds when moving out of a project.
   */
  async fetchAgentConfigurationAndContentFragmentIds(
    auth: Authenticator
  ): Promise<{
    agentConfigurationIds: string[];
    contentFragmentDatasourceViewIds: string[];
  }> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const agentMessages = await MessageModel.findAll({
      where: {
        conversationId: this.id,
        workspaceId,
        agentMessageId: { [Op.ne]: null },
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          attributes: ["agentConfigurationId"],
        },
      ],
    });

    const agentConfigurationIds = uniq(
      agentMessages
        .map((m) => m.agentMessage?.agentConfigurationId)
        .filter((id): id is string => Boolean(id))
    );

    const cfMessages = await MessageModel.findAll({
      where: {
        conversationId: this.id,
        workspaceId,
        contentFragmentId: { [Op.ne]: null },
      },
      include: [
        {
          model: ContentFragmentModel,
          as: "contentFragment",
          required: true,
        },
      ],
    });

    const contentFragmentDatasourceViewIds = uniq(
      cfMessages
        .map((m) => {
          const modelId = m.contentFragment?.nodeDataSourceViewId;
          if (modelId == null) {
            return null;
          }
          return DataSourceViewResource.modelIdToSId({
            id: modelId,
            workspaceId,
          });
        })
        .filter((sId): sId is string => sId !== null)
    );

    return { agentConfigurationIds, contentFragmentDatasourceViewIds };
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
    conversation: ConversationWithoutContentType | ConversationResource
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
    } catch (err) {
      return new Err(normalizeError(err));
    }

    return new Ok(undefined);
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
    conversationIds: string[]
  ) {
    const conversations = await ConversationResource.fetchByIds(
      auth,
      conversationIds
    );

    const conversationModelIds = conversations.map((c) => c.id);

    const userModelId = auth.getNonNullableUser().id;
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    // Skip rows already at the target value to avoid a no-op row lock/write.
    await ConversationParticipantModel.update(
      { actionRequired: false },
      {
        where: {
          conversationId: { [Op.in]: conversationModelIds },
          workspaceId: workspaceModelId,
          userId: userModelId,
          actionRequired: { [Op.ne]: false },
        },
      }
    );

    // Update the existing UserConversationReads entries
    const existingReads = await UserConversationReadsModel.findAll({
      where: {
        conversationId: { [Op.in]: conversationModelIds },
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
    const conversationModelIdsWithExistingReads = new Set(
      existingReads.map((read) => read.conversationId)
    );
    const conversationModelIdsNeedingNewReads = conversationModelIds.filter(
      (id) => !conversationModelIdsWithExistingReads.has(id)
    );
    await UserConversationReadsModel.bulkCreate(
      conversationModelIdsNeedingNewReads.map((conversationModelId) => ({
        conversationId: conversationModelId,
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

  toListItem(): ConversationListItemType {
    return {
      actionRequired: this.userParticipation?.actionRequired ?? false,
      created: this.createdAt.getTime(),
      hasError: this.hasError,
      lastReadMs: this.userLastReadAt?.getTime() ?? null,
      metadata: this.metadata ?? {},
      nextWakeupAt: this.nextWakeupAt,
      requestedSpaceIds: this.getRequestedSpaceIdsFromModel(),
      sId: this.sId,
      spaceId: this.space?.sId ?? null,
      title: getConversationDisplayTitle({
        created: this.createdAt.getTime(),
        forkingData: this.forkingData,
        title: this.title,
      }),
      triggerId: this.triggerSId,
      unread:
        this.userLastReadAt === null || this.updatedAt > this.userLastReadAt,
      updated: this.updatedAt.getTime(),
      isRunningAgentLoop: this.isRunningAgentLoop,
      isParticipant: !!this.userParticipation,
    };
  }

  toJSON(): ConversationWithoutContentType {
    return {
      ...this.toListItem(),
      // When listing with to JSON, return the title stored with the model.
      title: this.title,
      id: this.id,
      depth: this.depth,
      ...(this.forkingData && { forkingData: this.forkingData }),
    };
  }
}
