import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";
import type {
  AgentSuggestionState,
  AgentSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import { parseAgentSuggestionData } from "@app/types/suggestions/agent_suggestion";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentSuggestionResource extends ReadonlyAttributesType<AgentSuggestionModel> {}

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

  constructor(
    model: ModelStatic<AgentSuggestionModel>,
    blob: Attributes<AgentSuggestionModel>,
    editorsGroupId: ModelId | null
  ) {
    super(AgentSuggestionModel, blob);
    this.editorsGroupId = editorsGroupId;
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
  ): Promise<Map<string, ModelId | null>> {
    if (agentSIds.length === 0) {
      return new Map();
    }

    // Fetch agent configurations.
    const agentConfigs = await getAgentConfigurations(auth, {
      agentIds: agentSIds,
      variant: "light",
    });

    if (agentConfigs.length === 0) {
      const result = new Map<string, ModelId | null>();
      for (const sId of agentSIds) {
        result.set(sId, null);
      }
      return result;
    }

    // Fetch editor groups for these agents.
    const groupsResult = await GroupResource.findEditorGroupsForAgents(
      auth,
      agentConfigs
    );

    // Build a map from agent sId to editors group ID.
    const result = new Map<string, ModelId | null>();
    for (const sId of agentSIds) {
      if (groupsResult.isOk()) {
        const group = groupsResult.value[sId];
        result.set(sId, group?.id ?? null);
      } else {
        result.set(sId, null);
      }
    }

    return result;
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<AgentSuggestionModel>, "workspaceId">
  ): Promise<AgentSuggestionResource> {
    const owner = auth.getNonNullableWorkspace();

    // Look up the agent's editors group.
    const editorsGroupIdMap = await this.getEditorsGroupIdByAgentSId(auth, [
      blob.agentConfigurationIdTmp,
    ]);
    const editorsGroupId =
      editorsGroupIdMap.get(blob.agentConfigurationIdTmp) ?? null;

    // Check permission.
    const canWrite =
      auth.isAdmin() ||
      (editorsGroupId !== null &&
        editorsGroupId !== null &&
        auth.hasGroupByModelId(editorsGroupId));

    if (!canWrite) {
      throw new Error("User does not have permission to edit this agent");
    }

    const suggestion = await AgentSuggestionModel.create({
      ...blob,
      workspaceId: owner.id,
    });

    return new this(AgentSuggestionModel, suggestion.get(), editorsGroupId);
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
      ...otherOptions,
    });

    if (suggestions.length === 0) {
      return [];
    }

    const agentSIds = [
      ...new Set(suggestions.map((s) => s.agentConfigurationIdTmp)),
    ];

    const editorsGroupIdBySId = await this.getEditorsGroupIdByAgentSId(
      auth,
      agentSIds
    );

    const authGroupIds = new Set(auth.groupModelIds());

    // Filter suggestions to only include those for agents the user can edit.
    return suggestions
      .filter((s) => {
        if (auth.isAdmin()) {
          return true;
        }
        const groupId = editorsGroupIdBySId.get(s.agentConfigurationIdTmp);
        return (
          groupId !== undefined && groupId !== null && authGroupIds.has(groupId)
        );
      })
      .map((suggestion) => {
        const editorsGroupId =
          editorsGroupIdBySId.get(suggestion.agentConfigurationIdTmp) ?? null;
        return new this(AgentSuggestionModel, suggestion.get(), editorsGroupId);
      });
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

  get sId(): string {
    return AgentSuggestionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  async updateState(
    auth: Authenticator,
    state: AgentSuggestionState,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    assert(
      this.workspaceId === auth.getNonNullableWorkspace().id,
      "Unexpected: workspace mismatch in suggestion"
    );

    if (!this.canWrite(auth)) {
      throw new Error("User does not have permission to edit this agent");
    }

    await this.update({ state }, transaction);
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
      agentConfigurationId: this.agentConfigurationIdTmp,
      agentConfigurationVersion: this.agentConfigurationVersion,
      analysis: this.analysis,
      state: this.state,
      source: this.source,
      ...suggestionData,
    };
  }
}
