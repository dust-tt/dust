import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import {
  getAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { LightAgentConfigurationType, ModelId, Result } from "@app/types";
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

  readonly agentConfiguration: LightAgentConfigurationType | null;

  constructor(
    model: ModelStatic<AgentSuggestionModel>,
    blob: Attributes<AgentSuggestionModel>,
    agentConfiguration: LightAgentConfigurationType | null
  ) {
    super(AgentSuggestionModel, blob);
    this.agentConfiguration = agentConfiguration;
  }

  /**
   * Check if the user has permission to edit this suggestion's agent.
   */
  canEdit(auth: Authenticator): boolean {
    if (auth.isAdmin()) {
      return true;
    }
    return this.agentConfiguration?.canEdit ?? false;
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<AgentSuggestionModel>, "workspaceId">
  ): Promise<AgentSuggestionResource> {
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: blob.agentConfigurationId,
      variant: "light",
    });

    const canEdit = auth.isAdmin() || (agentConfiguration?.canEdit ?? false);
    if (!canEdit) {
      throw new Error("User does not have permission to edit this agent");
    }

    const suggestion = await AgentSuggestionModel.create({
      ...blob,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    return new this(AgentSuggestionModel, suggestion.get(), agentConfiguration);
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<AgentSuggestionModel>
  ) {
    const { where, ...otherOptions } = options ?? {};

    const suggestions = await AgentSuggestionModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
    });

    const agentIds = [
      ...new Set(suggestions.map((s) => s.agentConfigurationId)),
    ];

    // Fetch all agent configurations at once.
    const agentConfigurations = await getAgentConfigurations(auth, {
      agentIds,
      variant: "light",
    });
    const agentsByIdMap = new Map(agentConfigurations.map((c) => [c.sId, c]));

    // Filter suggestions to only include those for agents the user can edit
    return suggestions
      .filter((s) => {
        if (auth.isAdmin()) {
          return true;
        }
        const config = agentsByIdMap.get(s.agentConfigurationId);
        return config?.canEdit ?? false;
      })
      .map(
        (suggestion) =>
          new this(
            AgentSuggestionModel,
            suggestion.get(),
            agentsByIdMap.get(suggestion.agentConfigurationId) ?? null
          )
      );
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
    if (!this.canEdit(auth)) {
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

    if (!this.canEdit(auth)) {
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
      agentConfigurationId: this.agentConfigurationId,
      agentConfigurationVersion: this.agentConfigurationVersion,
      analysis: this.analysis,
      state: this.state,
      source: this.source,
      ...suggestionData,
    };
  }
}
