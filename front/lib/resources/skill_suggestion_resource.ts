import { isAuthorizedForSkillSuggestion } from "@app/lib/api/skills/suggestion_authorization";
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
import { extractUniqueSkillReferenceIds } from "@app/lib/skills/format";
import { SKILL_STATUSES } from "@app/types/assistant/skill_configuration_constants";
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
import {
  isEditSkillSuggestion,
  parseSkillSuggestionData,
  SkillSuggestionDataSchema,
} from "@app/types/suggestions/skill_suggestion";
import uniq from "lodash/uniq";
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

export interface SkillSuggestionResource extends ReadonlyAttributesType<SkillSuggestionModel> {}

/**
 * Resource for managing skill suggestions.
 *
 * IMPORTANT: Creating, reading, updating and deleting a suggestion requires what its kind needs on
 * the associated skill, see `isAuthorizedForSkillSuggestion`.
 */
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
    const [suggestion] = await this.createSuggestionsForSkill(auth, skill, [
      blob,
    ]);
    return suggestion;
  }

  /**
   * Same as `createSuggestionForSkill`, batched: every suggestion is inserted in a single query.
   * Throws, without inserting anything, if the caller lacks the verb any of the kinds requires.
   */
  static async createSuggestionsForSkill(
    auth: Authenticator,
    skill: SkillResource,
    blobs: Omit<
      CreationAttributes<SkillSuggestionModel>,
      "workspaceId" | "skillConfigurationId"
    >[]
  ): Promise<SkillSuggestionResource[]> {
    if (blobs.length === 0) {
      return [];
    }

    const owner = auth.getNonNullableWorkspace();

    if (
      !blobs.every((blob) => isAuthorizedForSkillSuggestion(auth, skill, blob))
    ) {
      throw new Error("User does not have permission to edit this skill");
    }

    const suggestions = await SkillSuggestionModel.bulkCreate(
      blobs.map((blob) => ({
        ...blob,
        skillConfigurationId: skill.id,
        workspaceId: owner.id,
      }))
    );

    return suggestions.map(
      (suggestion) =>
        new this(SkillSuggestionModel, suggestion.get(), skill.sId, null, null)
    );
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SkillSuggestionModel> & {
      dangerouslyBypassConversationsVisibilityCheck?: boolean;
    }
  ): Promise<SkillSuggestionResource[]> {
    const { resources } = await this.baseFetchWithAccess(auth, options);
    return resources;
  }

  // Also returns the matching rows dropped because the caller is not authorized for their kind.
  private static async baseFetchWithAccess(
    auth: Authenticator,
    options?: ResourceFindOptions<SkillSuggestionModel> & {
      dangerouslyBypassConversationsVisibilityCheck?: boolean;
    }
  ): Promise<{
    resources: SkillSuggestionResource[];
    inaccessible: SkillSuggestionModel[];
  }> {
    const {
      where,
      dangerouslyBypassConversationsVisibilityCheck,
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
          // Only used for the required inner join's existence check: the skill is fetched below.
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
      return { resources: [], inaccessible: [] };
    }

    const skillsById = await this.getSkillsByModelId(
      auth,
      suggestions.map((s) => s.skillConfigurationId)
    );

    const resources: SkillSuggestionResource[] = [];
    const inaccessible: SkillSuggestionModel[] = [];
    for (const suggestion of suggestions) {
      const skill = skillsById.get(suggestion.skillConfigurationId);
      if (!skill || !this.isAuthorizedForKind(auth, skill, suggestion)) {
        inaccessible.push(suggestion);
        continue;
      }
      const user = suggestion.updatedByUser;
      const updatedBy = user
        ? {
            sId: user.sId,
            fullName: [user.firstName, user.lastName].filter(Boolean).join(" "),
            email: user.email,
          }
        : null;
      resources.push(
        new this(
          SkillSuggestionModel,
          suggestion.get(),
          skill.sId,
          updatedBy,
          suggestion.notificationConversation?.sId ?? null
        )
      );
    }

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

    return { resources, inaccessible };
  }

  // Admins get the skills they cannot read too (redacted): they can still apply the kinds
  // that only need `admin`, e.g. availability.
  private static async getSkillsByModelId(
    auth: Authenticator,
    skillModelIds: ModelId[]
  ): Promise<Map<ModelId, SkillResource>> {
    const skills = await SkillResource.fetchByModelIds(
      auth,
      [...new Set(skillModelIds)],
      {
        status: [...SKILL_STATUSES],
        withTools: false,
        permissionFiltering: auth.isAdmin() ? "redact_unreadable" : "strict",
      }
    );
    return new Map(skills.map((skill) => [skill.id, skill]));
  }

  private static isAuthorizedForKind(
    auth: Authenticator,
    skill: SkillResource,
    suggestion: SkillSuggestionModel
  ): boolean {
    const parsed = SkillSuggestionDataSchema.safeParse({
      kind: suggestion.kind,
      suggestion: suggestion.suggestion,
    });
    return (
      parsed.success && isAuthorizedForSkillSuggestion(auth, skill, parsed.data)
    );
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
   * source, along with the batches holding a suggestion the caller cannot access: its skill cannot
   * be fetched, or the caller lacks what the suggestion's kind requires on it.
   */
  static async listByBatchModelIds(
    auth: Authenticator,
    batchModelIds: ModelId[]
  ): Promise<{
    suggestions: SkillSuggestionResource[];
    inaccessibleBatchModelIds: Set<ModelId>;
  }> {
    if (batchModelIds.length === 0) {
      return { suggestions: [], inaccessibleBatchModelIds: new Set() };
    }

    const { resources, inaccessible } = await this.baseFetchWithAccess(auth, {
      where: { batchId: batchModelIds },
      order: [["id", "ASC"]],
    });

    return {
      suggestions: resources,
      inaccessibleBatchModelIds: new Set(
        removeNulls(inaccessible.map((s) => s.batchId))
      ),
    };
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

  /**
   * @cc [owner:fabiencelier,label:product] batched-state-only-through-batch
   * `bulkUpdateState` MUST throw, without updating anything, when one of the suggestions belongs to
   * a batch.
   */
  static async bulkUpdateState(
    auth: Authenticator,
    suggestions: SkillSuggestionResource[],
    state: SkillSuggestionState,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (suggestions.length === 0) {
      return;
    }

    if (suggestions.some((s) => s.batchId !== null)) {
      throw new Error(
        "Suggestions that belong to a batch can only change state through their batch."
      );
    }

    await this.model.update(this.stateUpdate(auth, state), {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: { [Op.in]: suggestions.map((s) => s.id) },
      },
      transaction,
    });
  }

  /**
   * Sets the state of every suggestion of the given batches.
   */
  static async updateStateOfBatchMembers(
    auth: Authenticator,
    batchModelIds: ModelId[],
    state: SkillSuggestionState,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (batchModelIds.length === 0) {
      return;
    }

    await this.model.update(this.stateUpdate(auth, state), {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        batchId: batchModelIds,
      },
      transaction,
    });
  }

  // Track the user who accepted/rejected. Do not set for "outdated" (suggestion became obsolete)
  // or "pending" (reset).
  private static stateUpdate(
    auth: Authenticator,
    state: SkillSuggestionState
  ): { state: SkillSuggestionState; updatedByUserId?: ModelId } {
    const user = auth.user();
    if ((state === "approved" || state === "rejected") && user) {
      return { state, updatedByUserId: user.id };
    }
    return { state };
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

  // Skills referenced inline by the instruction edits of this suggestion.
  getReferencedSkillIds(): string[] {
    if (!isEditSkillSuggestion(this)) {
      return [];
    }

    return uniq(
      (this.suggestion.instructionEdits ?? []).flatMap((edit) =>
        extractUniqueSkillReferenceIds(edit.content)
      )
    );
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
