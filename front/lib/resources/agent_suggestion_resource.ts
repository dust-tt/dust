import { isAuthorizedForAgentSuggestionKind } from "@app/lib/api/assistant/agent_suggestion_authorization";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  AgentSuggestionKind,
  AgentSuggestionSource,
  AgentSuggestionState,
  AgentSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import { parseAgentSuggestionData } from "@app/types/suggestions/agent_suggestion";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

export interface AgentSuggestionResource
  extends ReadonlyAttributesType<AgentSuggestionModel> {}

/**
 * Resource for managing agent suggestions.
 *
 * IMPORTANT: Creating, reading, updating and deleting a suggestion requires the permissions its kind
 * needs to be applied.
 */
/**
 * @cc [owner:fabiencelier,label:security] agent-suggestion-access-follows-kind
 * Creating, fetching (through any read path), updating the state of, and deleting a suggestion MUST
 * require the caller to be authorized for its kind by `isAuthorizedForAgentSuggestionKind`, the
 * check applying it requires.
 */
export class AgentSuggestionResource extends BaseResource<AgentSuggestionModel> {
  static model: ModelStatic<AgentSuggestionModel> = AgentSuggestionModel;

  private readonly agent: AgentResource;
  readonly _conversationId: string | null;

  constructor(
    model: ModelStatic<AgentSuggestionModel>,
    blob: Attributes<AgentSuggestionModel>,
    agent: AgentResource,
    conversationId: string | null
  ) {
    super(AgentSuggestionModel, blob);
    this.agent = agent;
    this._conversationId = conversationId;
  }

  get _agentConfigurationId(): string {
    return this.agent.sId;
  }

  private static async getAgentById(
    auth: Authenticator,
    agentIds: string[]
  ): Promise<Map<string, AgentResource>> {
    if (agentIds.length === 0) {
      return new Map();
    }

    const resources = await AgentResource.fetchByIds(auth, agentIds);

    return new Map(resources.map((resource) => [resource.sId, resource]));
  }

  static async createSuggestionForAgent(
    auth: Authenticator,
    agent: AgentResource,
    blob: Omit<
      CreationAttributes<AgentSuggestionModel>,
      "workspaceId" | "agentConfigurationId"
    >
  ): Promise<AgentSuggestionResource> {
    const [suggestion] = await this.createSuggestionsForAgent(auth, agent, [
      blob,
    ]);
    return suggestion;
  }

  /**
   * @cc [owner:avervaet,label:product] explicit-suggestion-source
   * Callers MUST pass `source` reflecting the surface that proposed each suggestion.
   * The column's `sidekick` database default exists only to cover rows
   * inserted before this contract, not as a fallback for new call sites.
   */
  /**
   * Same as `createSuggestionForAgent`, batched: every suggestion is inserted in a single query,
   * instead of once per suggestion.
   */
  static async createSuggestionsForAgent(
    auth: Authenticator,
    agent: AgentResource,
    blobs: Omit<
      CreationAttributes<AgentSuggestionModel>,
      "workspaceId" | "agentConfigurationId"
    >[]
  ): Promise<AgentSuggestionResource[]> {
    if (blobs.length === 0) {
      return [];
    }

    const owner = auth.getNonNullableWorkspace();

    if (
      !blobs.every((blob) =>
        isAuthorizedForAgentSuggestionKind(auth, agent, blob.kind)
      )
    ) {
      throw new Error(
        "User does not have permission to suggest this change to the agent"
      );
    }

    const suggestions = await AgentSuggestionModel.bulkCreate(
      blobs.map((blob) => ({
        ...blob,
        agentConfigurationId: agent.agentConfigurationModelId,
        workspaceId: owner.id,
      }))
    );

    return suggestions.map(
      (suggestion) =>
        new this(AgentSuggestionModel, suggestion.get(), agent, null)
    );
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<AgentSuggestionModel>
  ): Promise<AgentSuggestionResource[]> {
    const { resources } = await this.baseFetchWithAccess(auth, options);
    return resources;
  }

  // Also returns the matching rows dropped because the caller cannot edit their agent.
  private static async baseFetchWithAccess(
    auth: Authenticator,
    options?: ResourceFindOptions<AgentSuggestionModel>
  ): Promise<{
    resources: AgentSuggestionResource[];
    inaccessible: AgentSuggestionModel[];
  }> {
    const { where, ...otherOptions } = options ?? {};
    const owner = auth.getNonNullableWorkspace();

    const suggestions = await AgentSuggestionModel.findAll({
      where: {
        ...where,
        workspaceId: owner.id,
      },
      include: [
        {
          model: AgentConfigurationModel,
          as: "agentConfiguration",
          required: true,
        },
        {
          model: ConversationModel,
          as: "conversation",
          required: false,
          attributes: ["sId"],
        },
      ],
      ...otherOptions,
    });

    if (suggestions.length === 0) {
      return { resources: [], inaccessible: [] };
    }

    // Get unique agent sIds from the included AgentConfigurationModel.
    const agentIds = [
      ...new Set(suggestions.map((s) => s.agentConfiguration?.sId ?? "")),
    ].filter((sId) => sId !== "");

    const agentById = await this.getAgentById(auth, agentIds);

    // Filter suggestions to only include those for agents the user can edit.
    const resources: AgentSuggestionResource[] = [];
    const inaccessible: AgentSuggestionModel[] = [];
    for (const suggestion of suggestions) {
      const agent = agentById.get(suggestion.agentConfiguration.sId);
      if (
        !agent ||
        !isAuthorizedForAgentSuggestionKind(auth, agent, suggestion.kind)
      ) {
        inaccessible.push(suggestion);
        continue;
      }
      resources.push(
        new this(
          AgentSuggestionModel,
          suggestion.get(),
          agent,
          suggestion.conversation?.sId ?? null
        )
      );
    }

    return { resources, inaccessible };
  }

  private isAuthorizedForKind(auth: Authenticator): boolean {
    return isAuthorizedForAgentSuggestionKind(auth, this.agent, this.kind);
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<AgentSuggestionResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: removeNulls(ids.map(getResourceIdFromSId)),
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<AgentSuggestionResource | null> {
    const [suggestion] = await this.fetchByIds(auth, [id]);
    return suggestion ?? null;
  }

  /**
   * Lists all suggestions for an agent identified by its sId.
   * Optionally filter by state and kind.
   */
  static async listByAgentConfigurationId(
    auth: Authenticator,
    agentId: string,
    filters?: {
      states?: AgentSuggestionState[];
      kind?: AgentSuggestionKind;
      sources?: AgentSuggestionSource[];
      conversationModelId?: ModelId;
      limit?: number;
    }
  ): Promise<AgentSuggestionResource[]> {
    const owner = auth.getNonNullableWorkspace();

    // First, find all agent configuration IDs for this agent sId (all versions).
    const agentConfigs = await AgentConfigurationModel.findAll({
      where: {
        sId: agentId,
        workspaceId: owner.id,
      },
      attributes: ["id", "sId"],
    });

    if (agentConfigs.length === 0) {
      return [];
    }

    const agentConfigIds = agentConfigs.map((ac) => ac.id);

    const whereClause: WhereOptions<AgentSuggestionModel> = {
      agentConfigurationId: agentConfigIds,
      ...(filters?.states &&
        filters.states.length > 0 && { state: filters.states }),
      ...(filters?.kind && { kind: filters.kind }),
      ...(filters?.sources &&
        filters.sources.length > 0 && { source: filters.sources }),
      ...(filters?.conversationModelId !== undefined && {
        conversationId: filters.conversationModelId,
      }),
    };

    return this.baseFetch(auth, {
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: filters?.limit,
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    if (!this.isAuthorizedForKind(auth)) {
      return new Err(
        new Error("User does not have permission to edit this suggestion")
      );
    }

    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  /**
   * Bulk delete a list of suggestion resources.
   * Requires super user permissions.
   */
  static async bulkDelete(
    auth: Authenticator,
    suggestions: AgentSuggestionResource[]
  ): Promise<Result<number, Error>> {
    if (!auth.isDustSuperUser()) {
      return new Err(new Error("Only super users can bulk delete suggestions"));
    }

    if (suggestions.length === 0) {
      return new Ok(0);
    }

    const owner = auth.getNonNullableWorkspace();
    const ids = suggestions.map((s) => s.id);

    const deletedCount = await AgentSuggestionModel.destroy({
      where: {
        workspaceId: owner.id,
        id: ids,
      },
    });

    return new Ok(deletedCount);
  }

  /**
   * WARNING: This method deletes ALL suggestions for a workspace.
   * Only workspace admins can perform this operation.
   * This is intended for internal use only (e.g., workspace deletion workflows).
   */
  static async deleteAllForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (!auth.isAdmin()) {
      throw new Error("Only workspace admins can delete all suggestions");
    }

    const owner = auth.getNonNullableWorkspace();
    await AgentSuggestionModel.destroy({
      where: {
        workspaceId: owner.id,
      },
      transaction,
    });
  }

  get sId(): string {
    return AgentSuggestionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  /**
   * @cc [owner:fabiencelier,label:product] batched-state-only-through-batch
   * `bulkUpdateState` MUST throw, without updating anything, when one of the suggestions belongs to
   * a batch.
   */
  static async bulkUpdateState(
    auth: Authenticator,
    suggestions: AgentSuggestionResource[],
    state: AgentSuggestionState,
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

    assert(
      suggestions.every((s) => s.isAuthorizedForKind(auth)),
      "User does not have permission to edit this suggestion"
    );

    await this.model.update(
      { state },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: { [Op.in]: suggestions.map((s) => s.id) },
        },
        transaction,
      }
    );
  }

  /**
   * Sets the state of every suggestion of the given batches. Reserved to `BatchSuggestionResource`,
   * which owns the state of batched suggestions (see `batched-state-only-through-batch`).
   */
  static async updateStateOfBatchMembers(
    auth: Authenticator,
    batchModelIds: ModelId[],
    state: AgentSuggestionState,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (batchModelIds.length === 0) {
      return;
    }

    await this.model.update(
      { state },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          batchId: batchModelIds,
        },
        transaction,
      }
    );
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("agent_suggestion", {
      id,
      workspaceId,
    });
  }

  toJSON(): AgentSuggestionType {
    const suggestionData = parseAgentSuggestionData({
      kind: this.kind,
      suggestion: this.suggestion,
    });

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      agentConfigurationId: this.agentConfigurationId,
      agentId: this._agentConfigurationId,
      analysis: this.analysis,
      state: this.state,
      source: this.source,
      conversationId: this._conversationId,
      batchId: this.batchId
        ? makeSId("batch_suggestion", {
            id: this.batchId,
            workspaceId: this.workspaceId,
          })
        : null,
      ...suggestionData,
    };
  }

  /**
   * Lists the suggestions belonging to the given batches (by batch model id), along with the
   * batches holding a suggestion whose agent the caller cannot edit.
   */
  static async listByBatchModelIds(
    auth: Authenticator,
    batchModelIds: ModelId[]
  ): Promise<{
    suggestions: AgentSuggestionResource[];
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
   * Lists all suggestions for the workspace.
   */
  static async listAll(
    auth: Authenticator
  ): Promise<AgentSuggestionResource[]> {
    return this.baseFetch(auth, {});
  }

  /**
   * Lists suggestions across multiple agents identified by their sIds.
   */
  static async listByAgentConfigurationIds(
    auth: Authenticator,
    agentIds: string[],
    filters?: {
      states?: AgentSuggestionState[];
      kind?: AgentSuggestionKind;
      limit?: number;
      createdAfter?: Date;
    }
  ): Promise<AgentSuggestionResource[]> {
    if (agentIds.length === 0) {
      return [];
    }

    const owner = auth.getNonNullableWorkspace();

    const agentConfigs = await AgentConfigurationModel.findAll({
      where: {
        sId: { [Op.in]: agentIds },
        workspaceId: owner.id,
        status: "active",
      },
      attributes: ["id", "sId"],
    });

    if (agentConfigs.length === 0) {
      return [];
    }

    const agentConfigIds = agentConfigs.map((ac) => ac.id);

    const whereClause: WhereOptions<AgentSuggestionModel> = {
      agentConfigurationId: agentConfigIds,
      ...(filters?.states &&
        filters.states.length > 0 && { state: filters.states }),
      ...(filters?.kind && { kind: filters.kind }),
      ...(filters?.createdAfter && {
        createdAt: { [Op.gte]: filters.createdAfter },
      }),
    };

    return this.baseFetch(auth, {
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: filters?.limit,
    });
  }
}
