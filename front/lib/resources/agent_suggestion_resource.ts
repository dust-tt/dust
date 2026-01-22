import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ModelId, Result } from "@app/types";
import { Err, normalizeError, Ok, removeNulls } from "@app/types";
import type {
  AgentSuggestionState,
  AgentSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import { parseAgentSuggestionData } from "@app/types/suggestions/agent_suggestion";

/**
 * Helper to check if a user has permission to manipulate suggestions for an agent.
 * Returns true if the user can edit the agent (is author, member of agent_editors group, or admin).
 */
async function canEditAgent(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<boolean> {
  if (auth.isAdmin()) {
    return true;
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });

  return agentConfiguration?.canEdit ?? false;
}

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

  constructor(
    model: ModelStatic<AgentSuggestionModel>,
    blob: Attributes<AgentSuggestionModel>
  ) {
    super(AgentSuggestionModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<AgentSuggestionModel>, "workspaceId">
  ): Promise<Result<AgentSuggestionResource, Error>> {
    const canEdit = await canEditAgent(auth, blob.agentConfigurationId);
    if (!canEdit) {
      return new Err(
        new Error("User does not have permission to edit this agent")
      );
    }

    const suggestion = await AgentSuggestionModel.create({
      ...blob,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    return new Ok(new this(AgentSuggestionModel, suggestion.get()));
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

    // Get unique agent IDs to check permissions.
    const agentIds = [
      ...new Set(suggestions.map((s) => s.agentConfigurationId)),
    ];

    // Check permissions for each unique agent ID.
    const permissionResults = await concurrentExecutor(
      agentIds,
      async (agentId) => ({
        agentId,
        canEdit: await canEditAgent(auth, agentId),
      }),
      { concurrency: 8 }
    );

    // Build a set of agent IDs the user can edit.
    const editableAgentIds = new Set(
      permissionResults.filter((r) => r.canEdit).map((r) => r.agentId)
    );

    // Filter suggestions to only include those for agents the user can edit.
    return suggestions
      .filter((s) => editableAgentIds.has(s.agentConfigurationId))
      .map((suggestion) => new this(AgentSuggestionModel, suggestion.get()));
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
    // Check if user has permission to edit the agent.
    const canEdit = await canEditAgent(auth, this.agentConfigurationId);
    if (!canEdit) {
      return new Err(
        new Error("User does not have permission to edit this agent")
      );
    }

    try {
      await this.model.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
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
  ): Promise<Result<undefined, Error>> {
    // Verify workspace match for security.
    if (this.workspaceId !== auth.getNonNullableWorkspace().id) {
      return new Err(new Error("Workspace mismatch"));
    }

    // Check if user has permission to edit the agent.
    const canEdit = await canEditAgent(auth, this.agentConfigurationId);
    if (!canEdit) {
      return new Err(
        new Error("User does not have permission to edit this agent")
      );
    }

    try {
      await this.update({ state }, transaction);
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
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
