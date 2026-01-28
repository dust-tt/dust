import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  ModelId,
  Result,
} from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";
import type {
  AgentSuggestionKind,
  AgentSuggestionState,
  AgentSuggestionType,
  InstructionsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import {
  isInstructionsSuggestion,
  isModelSuggestion,
  isSkillsSuggestion,
  isToolsSuggestion,
  parseAgentSuggestionData,
} from "@app/types/suggestions/agent_suggestion";

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
      variant: "light",
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
   * Prunes pending suggestions that can no longer be applied to the agent.
   * This should be called after saving an agent configuration to mark
   * outdated suggestions.
   *
   * Runs pruning checks in parallel for each suggestion kind.
   */
  static async pruneSuggestions(
    auth: Authenticator,
    agentConfiguration: AgentConfigurationType
  ): Promise<void> {
    const pendingSuggestions = await this.listByAgentConfigurationId(
      auth,
      agentConfiguration.sId,
      { states: ["pending"] }
    );

    if (pendingSuggestions.length === 0) {
      return;
    }

    const suggestionsByKind = new Map<
      AgentSuggestionKind,
      AgentSuggestionResource[]
    >();
    for (const suggestion of pendingSuggestions) {
      const kind = suggestion.kind as AgentSuggestionKind;
      if (!suggestionsByKind.has(kind)) {
        suggestionsByKind.set(kind, []);
      }
      suggestionsByKind.get(kind)!.push(suggestion);
    }

    const pruningTasks = [
      () =>
        this.pruneToolsSuggestions(
          auth,
          suggestionsByKind.get("tools") ?? [],
          agentConfiguration.actions
        ),
      () =>
        this.pruneSkillsSuggestions(
          auth,
          suggestionsByKind.get("skills") ?? [],
          agentConfiguration
        ),
      () =>
        this.pruneModelSuggestions(
          auth,
          suggestionsByKind.get("model") ?? [],
          agentConfiguration.model.modelId,
          agentConfiguration.model.reasoningEffort ?? null
        ),
      () =>
        this.pruneInstructionsSuggestions(
          auth,
          suggestionsByKind.get("instructions") ?? [],
          agentConfiguration.instructions
        ),
    ];

    await concurrentExecutor(pruningTasks, (task) => task(), {
      concurrency: 4,
    });
  }

  /** Outdated if any addition already exists or any deletion no longer exists. */
  private static async pruneToolsSuggestions(
    auth: Authenticator,
    suggestions: AgentSuggestionResource[],
    currentActions: MCPServerConfigurationType[]
  ): Promise<void> {
    // Collect mcpServerViewIds from current actions.
    // Suggestions store the mcpServerViewId as the tool identifier.
    const currentToolIds = new Set<string>();
    for (const action of currentActions) {
      if ("mcpServerViewId" in action && action.mcpServerViewId) {
        currentToolIds.add(action.mcpServerViewId);
      }
    }

    for (const suggestion of suggestions) {
      if (!isToolsSuggestion(suggestion.suggestion)) {
        continue;
      }
      let isOutdated = false;

      if (suggestion.suggestion.additions) {
        for (const addition of suggestion.suggestion.additions) {
          if (currentToolIds.has(addition.id)) {
            isOutdated = true;
            break;
          }
        }
      }

      if (!isOutdated && suggestion.suggestion.deletions) {
        for (const deletion of suggestion.suggestion.deletions) {
          if (!currentToolIds.has(deletion)) {
            isOutdated = true;
            break;
          }
        }
      }

      if (isOutdated) {
        await suggestion.updateState(auth, "outdated");
      }
    }
  }

  /** Outdated if any addition already exists or any deletion no longer exists. */
  private static async pruneSkillsSuggestions(
    auth: Authenticator,
    suggestions: AgentSuggestionResource[],
    agentConfiguration: AgentConfigurationType
  ): Promise<void> {
    if (suggestions.length === 0) {
      return;
    }
    const currentSkills = await SkillResource.listByAgentConfiguration(
      auth,
      agentConfiguration
    );
    const currentSkillIds = new Set(currentSkills.map((s) => s.sId));

    for (const suggestion of suggestions) {
      if (!isSkillsSuggestion(suggestion.suggestion)) {
        continue;
      }
      let isOutdated = false;

      if (suggestion.suggestion.additions) {
        for (const addition of suggestion.suggestion.additions) {
          if (currentSkillIds.has(addition)) {
            isOutdated = true;
            break;
          }
        }
      }

      if (!isOutdated && suggestion.suggestion.deletions) {
        for (const deletion of suggestion.suggestion.deletions) {
          if (!currentSkillIds.has(deletion)) {
            isOutdated = true;
            break;
          }
        }
      }

      if (isOutdated) {
        await suggestion.updateState(auth, "outdated");
      }
    }
  }

  /** Outdated if current model AND reasoning effort (when provided) match. */
  private static async pruneModelSuggestions(
    auth: Authenticator,
    suggestions: AgentSuggestionResource[],
    currentModelId: string,
    currentReasoningEffort: string | null
  ): Promise<void> {
    for (const suggestion of suggestions) {
      if (!isModelSuggestion(suggestion.suggestion)) {
        continue;
      }

      // Model must match.
      if (suggestion.suggestion.modelId !== currentModelId) {
        continue;
      }

      // If reasoning effort is provided in the suggestion, it must also match.
      if (suggestion.suggestion.reasoningEffort !== undefined) {
        if (suggestion.suggestion.reasoningEffort !== currentReasoningEffort) {
          continue;
        }
      }

      // Both model and reasoning effort (if provided) match -> outdated.
      await suggestion.updateState(auth, "outdated");
    }
  }

  private static async pruneInstructionsSuggestions(
    auth: Authenticator,
    suggestions: AgentSuggestionResource[],
    currentInstructions: string | null
  ): Promise<void> {
    if (suggestions.length === 0) {
      return;
    }

    // Suggestions are already sorted by createdAt DESC (most recent first).
    // We process them in order, tracking applied regions in the edited prompt.
    let editedInstructions = currentInstructions ?? "";
    const appliedRegions: Array<{ start: number; end: number }> = [];

    for (const suggestion of suggestions) {
      if (!isInstructionsSuggestion(suggestion.suggestion)) {
        continue;
      }
      const result = canApplyInstructionSuggestion(
        suggestion.suggestion,
        currentInstructions,
        editedInstructions,
        appliedRegions
      );

      if (!result.canApply) {
        await suggestion.updateState(auth, "outdated");
      } else {
        // Apply the suggestion to the edited instructions and track the regions.
        const { newEditedInstructions, newRegions, regionShift } = result;
        editedInstructions = newEditedInstructions;

        // Shift existing regions that come after the first new region by the total shift.
        if (newRegions.length > 0 && regionShift !== 0) {
          const firstNewRegionStart = newRegions[0].start;
          for (const region of appliedRegions) {
            if (region.start >= firstNewRegionStart) {
              region.start += regionShift;
              region.end += regionShift;
            }
          }
        }

        appliedRegions.push(...newRegions);
      }
    }
  }
}

/**
 * Checks if an instruction suggestion can be applied.
 * Returns whether it can be applied, and if so, the updated edited instructions
 * and the regions that were modified.
 *
 * When expectedOccurrences > 1, all occurrences must be replaceable without
 * overlapping each other or any previously applied regions.
 */
function canApplyInstructionSuggestion(
  suggestion: InstructionsSuggestionType,
  currentInstructions: string | null,
  editedInstructions: string,
  appliedRegions: Array<{ start: number; end: number }>
):
  | { canApply: false }
  | {
      canApply: true;
      newEditedInstructions: string;
      newRegions: Array<{ start: number; end: number }>;
      regionShift: number;
    } {
  const { oldString, newString, expectedOccurrences } = suggestion;

  // Check 1: oldString must exist in current instructions.
  if (
    currentInstructions === null ||
    !currentInstructions.includes(oldString)
  ) {
    return { canApply: false };
  }

  const positions = findAllOccurrences(editedInstructions, oldString);

  // Verify occurrence coun
  if (expectedOccurrences !== undefined) {
    if (positions.length !== expectedOccurrences) {
      return { canApply: false };
    }
  } else {
    if (positions.length !== 1) {
      return { canApply: false };
    }
  }

  // Compute the range of characters that actually change in this suggestion.
  // This allows suggestions with overlapping source regions but non-overlapping
  // changes to both remain valid.
  const changedRange = computeChangedRange(oldString, newString);

  const newRegions: Array<{ start: number; end: number }> = positions.map(
    (pos) => ({
      start: pos + changedRange.start,
      end: pos + changedRange.end,
    })
  );

  // No new changed region should overlap with any applied changed region.
  for (const newRegion of newRegions) {
    for (const appliedRegion of appliedRegions) {
      if (
        regionsOverlap(
          newRegion.start,
          newRegion.end,
          appliedRegion.start,
          appliedRegion.end
        )
      ) {
        return { canApply: false };
      }
    }
  }

  // Apply all replacements from last to first (to preserve positions).
  let result = editedInstructions;
  const sortedPositions = [...positions].sort((a, b) => b - a); // Descending order
  for (const pos of sortedPositions) {
    result =
      result.substring(0, pos) +
      newString +
      result.substring(pos + oldString.length);
  }

  // Calculate final regions after replacement (tracking only the changed portion).
  const singleShift = newString.length - oldString.length;
  const totalShift = singleShift * positions.length;

  const finalRegions: Array<{ start: number; end: number }> = [];
  let accumulatedShift = 0;

  for (const pos of positions) {
    finalRegions.push({
      start: pos + changedRange.start + accumulatedShift,
      end: pos + changedRange.end + accumulatedShift,
    });
    accumulatedShift += singleShift;
  }

  return {
    canApply: true,
    newEditedInstructions: result,
    newRegions: finalRegions,
    regionShift: totalShift,
  };
}

/** Returns all positions of substr in str (non-overlapping). */
function findAllOccurrences(str: string, substr: string): number[] {
  const positions: number[] = [];
  let pos = 0;
  while ((pos = str.indexOf(substr, pos)) !== -1) {
    positions.push(pos);
    pos += substr.length; // Move past this occurrence (non-overlapping)
  }
  return positions;
}

function regionsOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  // Regions overlap if one starts before the other ends and vice versa.
  return start1 < end2 && start2 < end1;
}

/**
 * Computes the range of characters that actually change between oldString and newString.
 * Returns a {start, end} range relative to the oldString positions,
 * where start is inclusive and end is exclusive.
 *
 * For example:
 * - "ABC" -> "AXC" returns {start: 1, end: 2} (only B changes to X)
 * - "ABC" -> "AXXC" returns {start: 1, end: 2} (B is replaced, insertion happens there)
 * - "ABCD" -> "AXYD" returns {start: 1, end: 3} (BC changes to XY)
 *
 * TODO(copilot): We may store this in DB to avoid recomputing it each time.
 */
function computeChangedRange(
  oldString: string,
  newString: string
): { start: number; end: number } {
  // Find common prefix length.
  let prefixLen = 0;
  while (
    prefixLen < oldString.length &&
    prefixLen < newString.length &&
    oldString[prefixLen] === newString[prefixLen]
  ) {
    prefixLen++;
  }

  // Find common suffix length (but don't overlap with prefix).
  let suffixLen = 0;
  while (
    suffixLen < oldString.length - prefixLen &&
    suffixLen < newString.length - prefixLen &&
    oldString[oldString.length - 1 - suffixLen] ===
      newString[newString.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // The changed region in oldString is from prefixLen to (oldString.length - suffixLen).
  const changedStart = prefixLen;
  const changedEnd = oldString.length - suffixLen;

  return { start: changedStart, end: Math.max(changedStart, changedEnd) };
}
