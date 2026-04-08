import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillSuggestionModel } from "@app/lib/models/skill/skill_suggestion";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
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
} from "@app/types/suggestions/skill_suggestion";
import { parseSkillSuggestionData } from "@app/types/suggestions/skill_suggestion";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

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

  readonly editorsGroupId: ModelId | null;
  readonly skillConfigurationSId: string;
  readonly sourceConversationSId: string | null;

  constructor(
    model: ModelStatic<SkillSuggestionModel>,
    blob: Attributes<SkillSuggestionModel>,
    editorsGroupId: ModelId | null,
    skillConfigurationSId: string,
    sourceConversationSId: string | null
  ) {
    super(SkillSuggestionModel, blob);
    this.editorsGroupId = editorsGroupId;
    this.skillConfigurationSId = skillConfigurationSId;
    this.sourceConversationSId = sourceConversationSId;
  }

  /**
   * Check if the user has permission to write (edit/delete) this suggestion's skill.
   */
  canWrite(auth: Authenticator): boolean {
    if (auth.isAdmin()) {
      return true;
    }
    if (this.editorsGroupId === null) {
      return false;
    }
    return auth.hasGroupByModelId(this.editorsGroupId);
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

    if (!skill.canWrite(auth)) {
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
      skill.editorGroup?.id ?? null,
      skill.sId,
      null
    );
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SkillSuggestionModel>
  ) {
    const { where, ...otherOptions } = options ?? {};
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
        },
        {
          model: ConversationModel,
          as: "sourceConversation",
          required: false,
          attributes: ["sId"],
        },
      ],
      ...otherOptions,
    });

    if (suggestions.length === 0) {
      return [];
    }

    // Get unique skill configuration IDs to check permissions.
    const skillConfigIds = [
      ...new Set(suggestions.map((s) => s.skillConfigurationId)),
    ];

    const skillResources = await SkillResource.fetchByModelIds(
      auth,
      skillConfigIds
    );

    const skillResourceByModelId = new Map(
      skillResources.map((s) => [s.id, s])
    );

    // Filter suggestions to only include those for skills the user can edit.
    return removeNulls(
      suggestions.map((suggestion) => {
        const skillResource = skillResourceByModelId.get(
          suggestion.skillConfigurationId
        );
        if (!skillResource || !skillResource.canWrite(auth)) {
          return null;
        }
        return new this(
          SkillSuggestionModel,
          suggestion.get(),
          skillResource.editorGroup?.id ?? null,
          skillResource.sId,
          suggestion.sourceConversation?.sId ?? null
        );
      })
    );
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<SkillSuggestionResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: removeNulls(ids.map(getResourceIdFromSId)),
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<SkillSuggestionResource | null> {
    const [suggestion] = await this.fetchByIds(auth, [id]);
    return suggestion ?? null;
  }

  /**
   * Lists all suggestions for a skill identified by its sId.
   * Optionally filter by state, source, and kind.
   */
  static async listBySkillConfigurationId(
    auth: Authenticator,
    skillId: string,
    filters?: {
      states?: SkillSuggestionState[];
      sources?: SkillSuggestionSource[];
      kind?: SkillSuggestionKind;
      limit?: number;
    }
  ): Promise<SkillSuggestionResource[]> {
    const skillModelId = getResourceIdFromSId(skillId);
    if (skillModelId === null) {
      return [];
    }

    // Build the where clause with optional filters.
    // By default, exclude synthetic suggestions unless an explicit sources
    // filter is provided.
    const sourceFilter =
      filters?.sources && filters.sources.length > 0
        ? { source: filters.sources }
        : { source: { [Op.ne]: "synthetic" } };

    const whereClause: WhereOptions<SkillSuggestionModel> = {
      skillConfigurationId: skillModelId,
      ...(filters?.states &&
        filters.states.length > 0 && { state: filters.states }),
      ...sourceFilter,
      ...(filters?.kind && { kind: filters.kind }),
    };

    return this.baseFetch(auth, {
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: filters?.limit,
    });
  }

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    if (!this.canWrite(auth)) {
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
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      skillConfigurationId: this.skillConfigurationSId,
      analysis: this.analysis,
      state: this.state,
      source: this.source,
      sourceConversationId: this.sourceConversationSId,
      ...suggestionData,
    };
  }
}
