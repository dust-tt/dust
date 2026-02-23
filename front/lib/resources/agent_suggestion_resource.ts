import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  AgentSuggestionKind,
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentSuggestionResource
  extends ReadonlyAttributesType<AgentSuggestionModel> {}

/**
 * Resource for managing agent suggestions.
 *
 * IMPORTANT: Access to suggestions requires edit permissions on the associated agent.
 * Users can only create, read, update, or delete suggestions for agents they can edit
 * (i.e., they are the author, a member of the agent_editors group, or a workspace admin).
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentSuggestionResource extends BaseResource<AgentSuggestionModel> {
  static model: ModelStatic<AgentSuggestionModel> = AgentSuggestionModel;

  readonly editorsGroupId: ModelId | null;
  readonly agentConfigurationSId: string;
  constructor(
    model: ModelStatic<AgentSuggestionModel>,
    blob: Attributes<AgentSuggestionModel>,
    editorsGroupId: ModelId | null,
    agentConfigurationSId: string
  ) {
    super(AgentSuggestionModel, blob);
    this.editorsGroupId = editorsGroupId;
    this.agentConfigurationSId = agentConfigurationSId;
  }

  /**
   * Check if the user has permission to write (edit/delete) this suggestion's agent.
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

  /**
   * Fetches the editors group IDs for a list of agent configuration sIds.
   * Returns a map from agent sId to group ID (or null if no group found).
   */
  private static async getEditorsGroupIdByAgentSId(
    auth: Authenticator,
    agentSIds: string[]
  ): Promise<Map<string, ModelId>> {
    if (agentSIds.length === 0) {
      return new Map();
    }

    // Fetch agent configurations.
    const agentConfigs = await getAgentConfigurations(auth, {
      agentIds: agentSIds,
      variant: "extra_light",
    });

    if (agentConfigs.length === 0) {
      return new Map();
    }

    // Fetch editor groups for these agents.
    const groupsResult = await GroupResource.findEditorGroupsForAgents(
      auth,
      agentConfigs
    );

    // Build a map from agent sId to editors group ID.
    const result = new Map<string, ModelId>();
    if (groupsResult.isOk()) {
      for (const sId of agentSIds) {
        const group = groupsResult.value[sId];
        if (group !== undefined) {
          result.set(sId, group.id);
        }
      }
    }

    return result;
  }

  static async createSuggestionForAgent(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType,
    blob: Omit<
      CreationAttributes<AgentSuggestionModel>,
      "workspaceId" | "agentConfigurationId"
    >
  ): Promise<AgentSuggestionResource> {
    const owner = auth.getNonNullableWorkspace();

    // Look up the agent's editors group.
    const editorsGroupIdMap = await this.getEditorsGroupIdByAgentSId(auth, [
      agentConfiguration.sId,
    ]);
    const editorsGroupId = editorsGroupIdMap.get(agentConfiguration.sId);

    // Check permission.
    const canWrite =
      auth.isAdmin() ||
      (editorsGroupId !== undefined && auth.hasGroupByModelId(editorsGroupId));

    if (!canWrite) {
      throw new Error("User does not have permission to edit this agent");
    }

    const suggestion = await AgentSuggestionModel.create({
      ...blob,
      agentConfigurationId: agentConfiguration.id,
      workspaceId: owner.id,
    });

    return new this(
      AgentSuggestionModel,
      suggestion.get(),
      editorsGroupId ?? null,
      agentConfiguration.sId
    );
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<AgentSuggestionModel>
  ) {
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
      ],
      ...otherOptions,
    });

    if (suggestions.length === 0) {
      return [];
    }

    // Get unique agent sIds from the included AgentConfigurationModel.
    const agentIds = [
      ...new Set(suggestions.map((s) => s.agentConfiguration?.sId ?? "")),
    ].filter((sId) => sId !== "");

    const editorsGroupIdBySId = await this.getEditorsGroupIdByAgentSId(
      auth,
      agentIds
    );

    // Filter suggestions to only include those for agents the user can edit.
    return removeNulls(
      suggestions.map((suggestion) => {
        if (!this.canWrite(auth, suggestion, editorsGroupIdBySId)) {
          return null;
        }
        const agentConfig = suggestion.agentConfiguration;
        const editorsGroupId = agentConfig
          ? (editorsGroupIdBySId.get(agentConfig.sId) ?? null)
          : null;
        return new this(
          AgentSuggestionModel,
          suggestion.get(),
          editorsGroupId,
          agentConfig.sId
        );
      })
    );
  }

  static canWrite(
    auth: Authenticator,
    suggestion: AgentSuggestionModel,
    editorsGroupIdBySId: Map<string, ModelId>
  ): boolean {
    if (auth.isAdmin()) {
      return true;
    }
    const agentConfig = suggestion.agentConfiguration;
    if (!agentConfig) {
      return false;
    }
    const groupId = editorsGroupIdBySId.get(agentConfig.sId);
    return groupId !== undefined && auth.hasGroupByModelId(groupId);
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

    // Build the where clause with optional filters.
    const whereClause: WhereOptions<AgentSuggestionModel> = {
      agentConfigurationId: agentConfigIds,
      ...(filters?.states &&
        filters.states.length > 0 && { state: filters.states }),
      ...(filters?.kind && { kind: filters.kind }),
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
    if (!this.canWrite(auth)) {
      return new Err(
        new Error("User does not have permission to edit this agent")
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

  static async bulkUpdateState(
    auth: Authenticator,
    suggestions: AgentSuggestionResource[],
    state: AgentSuggestionState
  ): Promise<void> {
    if (suggestions.length === 0) {
      return;
    }

    assert(
      suggestions.every((s) => s.canWrite(auth)),
      "User does not have permission to edit this agent"
    );

    await this.model.update(
      { state },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: { [Op.in]: suggestions.map((s) => s.id) },
        },
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
      analysis: this.analysis,
      state: this.state,
      source: this.source,
      ...suggestionData,
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
}
