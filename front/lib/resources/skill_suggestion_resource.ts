import { isAuthorizedForSkillSuggestionKind } from "@app/lib/api/skills/suggestion_authorization";
import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillSuggestionModel } from "@app/lib/models/skill/skill_suggestion";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  SkillSuggestionKind,
  SkillSuggestionSource,
  SkillSuggestionState,
  SkillSuggestionType,
  SkillSuggestionUpdatedBy,
} from "@app/types/suggestions/skill_suggestion";
import { parseSkillSuggestionData } from "@app/types/suggestions/skill_suggestion";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

// Sources that are never listed unless explicitly requested: `synthetic` rows are reinforcement
// intermediates, and `conversational` rows have no reviewing UI yet.
const HIDDEN_BY_DEFAULT_SOURCES: SkillSuggestionSource[] = [
  "synthetic",
  "conversational",
];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SkillSuggestionResource
  extends ReadonlyAttributesType<SkillSuggestionModel> {}

/**
 * Resource for managing skill suggestions.
 *
 * IMPORTANT: Access to suggestions requires edit permissions on the associated skill.
 * Users can only create, read, update, or delete suggestions for skills they can edit.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SkillSuggestionResource extends BaseResource<SkillSuggestionModel> {
  static model: ModelStatic<SkillSuggestionModel> = SkillSuggestionModel;

  readonly skillConfigurationSId: string;
  readonly updatedBy: SkillSuggestionUpdatedBy | null;
  readonly notificationConversationId: string | null;

  // Populated by baseFetch after conversation access filtering.
  visibleConversationIds: string[] = [];
  constructor(
    model: ModelStatic<SkillSuggestionModel>,
    blob: Attributes<SkillSuggestionModel>,
    skillConfigurationSId: string,
    updatedBy: SkillSuggestionUpdatedBy | null,
    notificationConversationId: string | null
  ) {
    super(SkillSuggestionModel, blob);
    this.skillConfigurationSId = skillConfigurationSId;
    this.updatedBy = updatedBy;
    this.notificationConversationId = notificationConversationId;
  }

  private hasWriteAccess(auth: Authenticator): boolean {
    if (auth.isAdmin()) {
      return true;
    }
    // Editors of a skill hold its `editor` grant, which resolves to write (see ROLE_REGISTRY).
    return auth
      .getGovernanceGrantVerbs(
        "skill",
        this.skillConfigurationId,
        this.workspaceId
      )
      .includes("write");
  }

  static async createSuggestionForSkill(
    auth: Authenticator,
    skill: SkillResource,
    blob: Omit<
      CreationAttributes<SkillSuggestionModel>,
      "workspaceId" | "skillConfigurationId"
    >
  ): Promise<SkillSuggestionResource> {
    const owner = auth.getNonNullableWorkspace();

    if (!isAuthorizedForSkillSuggestionKind(auth, skill, blob.kind)) {
      throw new Error("User does not have permission to edit this skill");
    }

    const suggestion = await SkillSuggestionModel.create({
      ...blob,
      skillConfigurationId: skill.id,
      workspaceId: owner.id,
    });

    return new this(
      SkillSuggestionModel,
      suggestion.get(),
      skill.sId,
      null,
      null
    );
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SkillSuggestionModel> & {
      dangerouslyBypassConversationsVisibilityCheck?: boolean;
      // Throw instead of silently dropping the suggestions the caller cannot access.
      throwOnInaccessible?: boolean;
    }
  ) {
    const {
      where,
      dangerouslyBypassConversationsVisibilityCheck,
      throwOnInaccessible,
      ...otherOptions
    } = options ?? {};
    const owner = auth.getNonNullableWorkspace();

    const suggestions = await SkillSuggestionModel.findAll({
      where: {
        ...where,
        workspaceId: owner.id,
      },
      include: [
        {
          model: SkillConfigurationModel,
          as: "skillConfiguration",
          required: true,
          // Only used for the required inner join's existence check: canAdministrateCustomSkillId
          // and modelIdToSId resolve permissions and sId from the id alone, no column needed here.
          attributes: [],
        },
        {
          model: UserModel,
          as: "updatedByUser",
          required: false,
          attributes: ["sId", "firstName", "lastName", "email"],
        },
        {
          model: ConversationModel,
          as: "notificationConversation",
          required: false,
          attributes: ["sId"],
        },
      ],
      ...otherOptions,
    });

    if (suggestions.length === 0) {
      return [];
    }

    // Filter suggestions to only include those for skills the user can administrate. Resolved
    // without fetching the skill row: `canAdministrateCustomSkillId` only needs the id and
    // workspace id, and `sId` is a pure derivation from the same pair. This also means a
    // suggestion whose skill was archived since (e.g. a `delete` suggestion archives its own
    // target on accept) stays visible: the permission check never depends on skill status.
    const resources = removeNulls(
      suggestions.map((suggestion) => {
        if (
          !SkillResource.canAdministrateCustomSkillId(auth, {
            id: suggestion.skillConfigurationId,
            workspaceId: owner.id,
          })
        ) {
          if (throwOnInaccessible) {
            throw new Error(
              "User does not have permission to access every requested skill suggestion"
            );
          }
          return null;
        }
        const user = suggestion.updatedByUser;
        const updatedBy = user
          ? {
              sId: user.sId,
              fullName: [user.firstName, user.lastName]
                .filter(Boolean)
                .join(" "),
              email: user.email,
            }
          : null;
        return new this(
          SkillSuggestionModel,
          suggestion.get(),
          SkillResource.modelIdToSId({
            id: suggestion.skillConfigurationId,
            workspaceId: owner.id,
          }),
          updatedBy,
          suggestion.notificationConversation?.sId ?? null
        );
      })
    );

    // Enrich resources with visible source conversation IDs.
    const allConversationModelIds = [
      ...new Set(
        resources.flatMap((r) => r.sourceConversationIds ?? []).map(Number)
      ),
    ];

    if (allConversationModelIds.length > 0) {
      const allConversations = await ConversationResource.fetchByModelIds(
        auth,
        allConversationModelIds
      );

      const visibleConversations = dangerouslyBypassConversationsVisibilityCheck
        ? allConversations
        : await ConversationResource.filterVisibleConversations(
            auth,
            allConversations
          );

      const visibleMap = new Map(
        visibleConversations.map((c) => [c.id, c.sId])
      );

      for (const resource of resources) {
        const sourceModelIds = (resource.sourceConversationIds ?? []).map(
          Number
        );
        resource.visibleConversationIds = removeNulls(
          sourceModelIds.map((id) => visibleMap.get(id))
        );
      }
    }

    return resources;
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    options?: { dangerouslyBypassConversationsVisibilityCheck?: boolean }
  ): Promise<SkillSuggestionResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: removeNulls(ids.map(getResourceIdFromSId)),
      },
      dangerouslyBypassConversationsVisibilityCheck:
        options?.dangerouslyBypassConversationsVisibilityCheck,
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string,
    options?: { dangerouslyBypassConversationsVisibilityCheck?: boolean }
  ): Promise<SkillSuggestionResource | null> {
    const [suggestion] = await this.fetchByIds(auth, [id], options);
    return suggestion ?? null;
  }

  /**
   * Lists all suggestions for a skill identified by its sId.
   * Optionally filter by state, source, kinds, and source conversation.
   */
  static async listBySkillConfigurationId(
    auth: Authenticator,
    skillId: string,
    filters?: {
      states?: SkillSuggestionState[];
      sources?: SkillSuggestionSource[];
      kinds?: readonly SkillSuggestionKind[];
      sourceConversationModelId?: ModelId;
      limit?: number;
      dangerouslyBypassConversationsVisibilityCheck?: boolean;
    }
  ): Promise<SkillSuggestionResource[]> {
    const skillModelId = getResourceIdFromSId(skillId);
    if (skillModelId === null) {
      return [];
    }

    // Build the where clause with optional filters.
    // By default, exclude hidden sources unless an explicit sources filter is
    // provided.
    const sourceFilter =
      filters?.sources && filters.sources.length > 0
        ? { source: filters.sources }
        : { source: { [Op.notIn]: HIDDEN_BY_DEFAULT_SOURCES } };

    const whereClause: WhereOptions<SkillSuggestionModel> = {
      skillConfigurationId: skillModelId,
      ...(filters?.states &&
        filters.states.length > 0 && { state: filters.states }),
      ...sourceFilter,
      ...(filters?.kinds &&
        filters.kinds.length > 0 && { kind: [...filters.kinds] }),
      ...(filters?.sourceConversationModelId !== undefined && {
        sourceConversationIds: {
          [Op.contains]: [filters.sourceConversationModelId],
        },
      }),
    };

    return this.baseFetch(auth, {
      where: whereClause,
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
      limit: filters?.limit,
      dangerouslyBypassConversationsVisibilityCheck:
        filters?.dangerouslyBypassConversationsVisibilityCheck,
    });
  }

  /**
   * Lists the suggestions belonging to the given batches (by batch model id), whatever their
   * source. Throws if the caller cannot administrate the skill of any of them.
   */
  static async listByBatchModelIds(
    auth: Authenticator,
    batchModelIds: ModelId[]
  ): Promise<SkillSuggestionResource[]> {
    if (batchModelIds.length === 0) {
      return [];
    }

    return this.baseFetch(auth, {
      where: { batchId: batchModelIds },
      order: [["id", "ASC"]],
      throwOnInaccessible: true,
    });
  }

  /**
   * Lists suggestions across the workspace, optionally filtered by state and source.
   */
  static async listByWorkspace(
    auth: Authenticator,
    filters?: {
      states?: SkillSuggestionState[];
      sources?: SkillSuggestionSource[];
      kinds?: readonly SkillSuggestionKind[];
      limit?: number;
      createdAfter?: Date;
      dangerouslyBypassConversationsVisibilityCheck?: boolean;
    }
  ): Promise<SkillSuggestionResource[]> {
    const sourceFilter =
      filters?.sources && filters.sources.length > 0
        ? { source: filters.sources }
        : { source: { [Op.notIn]: HIDDEN_BY_DEFAULT_SOURCES } };

    const whereClause: WhereOptions<SkillSuggestionModel> = {
      ...(filters?.states &&
        filters.states.length > 0 && { state: filters.states }),
      ...sourceFilter,
      ...(filters?.kinds &&
        filters.kinds.length > 0 && { kind: [...filters.kinds] }),
      ...(filters?.createdAfter && {
        createdAt: { [Op.gte]: filters.createdAfter },
      }),
    };

    return this.baseFetch(auth, {
      where: whereClause,
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
      limit: filters?.limit,
      dangerouslyBypassConversationsVisibilityCheck:
        filters?.dangerouslyBypassConversationsVisibilityCheck,
    });
  }

  /**
   * Sets the notification conversation on every given suggestion. Used after
   * creating the reinforcement notification conversation to link back from each
   * suggestion that was surfaced in it.
   */
  static async bulkSetNotificationConversation(
    auth: Authenticator,
    suggestions: SkillSuggestionResource[],
    notificationConversationModelId: ModelId
  ): Promise<void> {
    if (suggestions.length === 0) {
      return;
    }

    await this.model.update(
      { notificationConversationModelId: notificationConversationModelId },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: { [Op.in]: suggestions.map((s) => s.id) },
        },
      }
    );
  }

  /**
   * Returns whether any pending suggestions remain linked to the given
   * notification conversation.
   */
  static async hasPendingForNotificationConversation(
    auth: Authenticator,
    notificationConversationModelId: ModelId
  ): Promise<boolean> {
    const count = await SkillSuggestionModel.count({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        notificationConversationModelId,
        state: "pending",
      },
    });

    return count > 0;
  }

  static async bulkUpdateState(
    auth: Authenticator,
    suggestions: SkillSuggestionResource[],
    state: SkillSuggestionState,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (suggestions.length === 0) {
      return;
    }

    // Track the user who accepted/rejected. Do not set for "outdated"
    // (suggestion became obsolete) or "pending" (reset).
    const updates: { state: SkillSuggestionState; updatedByUserId?: ModelId } =
      { state };
    if (state === "approved" || state === "rejected") {
      const user = auth.user();
      if (user) {
        updates.updatedByUserId = user.id;
      }
    }

    await this.model.update(updates, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: { [Op.in]: suggestions.map((s) => s.id) },
      },
      transaction,
    });
  }

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    if (!this.hasWriteAccess(auth)) {
      return new Err(
        new Error("User does not have permission to edit this skill")
      );
    }

    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
    });

    return new Ok(undefined);
  }

  /**
   * Bulk-deletes the given suggestions.
   * Requires write permission on all suggestions.
   */
  static async bulkDelete(
    auth: Authenticator,
    suggestions: SkillSuggestionResource[]
  ): Promise<Result<number, Error>> {
    if (suggestions.length === 0) {
      return new Ok(0);
    }

    const nonWritable = suggestions.filter((s) => !s.hasWriteAccess(auth));
    if (nonWritable.length > 0) {
      return new Err(
        new Error(
          "User does not have permission to delete all the given suggestions"
        )
      );
    }

    const owner = auth.getNonNullableWorkspace();
    const ids = suggestions.map((s) => s.id);

    const deletedCount = await SkillSuggestionModel.destroy({
      where: {
        workspaceId: owner.id,
        id: ids,
      },
    });

    return new Ok(deletedCount);
  }

  /**
   * Deletes all synthetic suggestions older than the given cutoff date.
   * Requires admin permissions. Returns the number of deleted rows.
   */
  static async deleteExpiredSynthetic(
    auth: Authenticator,
    cutoffDate: Date,
    { limit }: { limit?: number } = {}
  ): Promise<number> {
    if (!auth.isAdmin()) {
      throw new Error(
        "Only workspace admins can delete expired synthetic suggestions"
      );
    }

    const owner = auth.getNonNullableWorkspace();

    return SkillSuggestionModel.destroy({
      where: {
        workspaceId: owner.id,
        source: "synthetic",
        createdAt: { [Op.lt]: cutoffDate },
      },
      limit,
    });
  }

  get sId(): string {
    return SkillSuggestionResource.modelIdToSId({
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
    return makeSId("skill_suggestion", {
      id,
      workspaceId,
    });
  }

  toJSON(): SkillSuggestionType {
    const suggestionData = parseSkillSuggestionData({
      kind: this.kind,
      suggestion: this.suggestion,
    });

    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      skillConfigurationId: this.skillConfigurationSId,
      analysis: this.analysis,
      title: this.title,
      state: this.state,
      source: this.source,
      sourceConversationsCount: this.sourceConversationIds?.length ?? 0,
      visibleSourceConversationIds: this.visibleConversationIds,
      notificationConversationId: this.notificationConversationId,
      updatedBy: this.updatedBy,
      batchId: this.batchId
        ? makeSId("batch_suggestion", {
            id: this.batchId,
            workspaceId: this.workspaceId,
          })
        : null,
      ...suggestionData,
    };
  }
}
