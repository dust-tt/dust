import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { updateAgentRequirements } from "@app/lib/api/assistant/configuration/agent_requirements";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import type { Authenticator } from "@app/lib/auth";
import { hasAll } from "@app/lib/matcher/operators/array";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillResourceWithConversations } from "@app/lib/resources/skill/skill_resource_conversations";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { AgentsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

/**
 * Layer of the SkillResource inheritance chain owning the skill/agent
 * relationship: which agents use a skill, usage reporting and the propagation
 * of skill space requirements to agent configurations.
 */
export abstract class SkillResourceWithAgents extends SkillResourceWithConversations {
  /**
   * Bridge to the fetching layer: fetching skills requires the concrete
   * `SkillResource` constructor, which only the final class can access.
   */
  protected abstract fetchSkillsByModelIds(
    auth: Authenticator,
    ids: ModelId[]
  ): Promise<SkillResource[]>;

  protected async listActiveAgents(
    auth: Authenticator
  ): Promise<AgentConfigurationModel[]> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkills = await AgentSkillModel.findAll({
      where: {
        ...this.skillReference,
        workspaceId: workspace.id,
      },
    });

    if (agentSkills.length === 0) {
      return [];
    }

    const agentConfigIds = agentSkills.map((as) => as.agentConfigurationId);

    return AgentConfigurationModel.findAll({
      where: {
        id: { [Op.in]: agentConfigIds },
        workspaceId: workspace.id,
        status: "active",
      },
    });
  }

  async fetchUsage(auth: Authenticator): Promise<AgentsUsageType> {
    const agents = await this.listActiveAgents(auth);

    const sortedAgents = agents
      .map((agent) => ({
        sId: agent.sId,
        name: agent.name,
        pictureUrl: agent.pictureUrl,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      count: sortedAgents.length,
      agents: sortedAgents,
    };
  }

  /**
   * Batch version of listActiveAgents, returns active agents grouped by skill sId.
   */
  protected static async batchListActiveAgents(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, AgentConfigurationModel[]>> {
    if (skills.length === 0) {
      return new Map();
    }

    const workspace = auth.getNonNullableWorkspace();

    // Separate custom skills from global skills.
    const customSkillIds = removeNulls(
      skills.map((s) => (s.globalSId ? null : s.id))
    );
    const globalSkillIds = removeNulls(skills.map((s) => s.globalSId));

    // Single query: all agent-skill associations for the given skills.
    const agentSkills = await AgentSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        [Op.or]: removeNulls([
          customSkillIds.length > 0
            ? { customSkillId: { [Op.in]: customSkillIds } }
            : null,
          globalSkillIds.length > 0
            ? { globalSkillId: { [Op.in]: globalSkillIds } }
            : null,
        ]),
      },
    });

    if (agentSkills.length === 0) {
      return new Map();
    }

    // Single query: all referenced agent configurations.
    const uniqueAgentConfigIds = [
      ...new Set(agentSkills.map((as) => as.agentConfigurationId)),
    ];
    const agentConfigs = await AgentConfigurationModel.findAll({
      where: {
        id: { [Op.in]: uniqueAgentConfigIds },
        workspaceId: workspace.id,
        status: "active",
      },
    });

    const agentConfigById = new Map(agentConfigs.map((a) => [a.id, a]));

    // Map AgentSkillModel references back to skill sId.
    const sIdByCustomId = new Map(
      skills.filter((s) => !s.globalSId).map((s) => [s.id, s.sId])
    );

    const result = new Map<string, AgentConfigurationModel[]>();
    for (const as of agentSkills) {
      const skillId = as.customSkillId
        ? sIdByCustomId.get(as.customSkillId)
        : (as.globalSkillId ?? undefined);
      if (!skillId) {
        continue;
      }
      const agent = agentConfigById.get(as.agentConfigurationId);
      if (!agent) {
        continue;
      }
      const list = result.get(skillId) ?? [];
      list.push(agent);
      result.set(skillId, list);
    }

    return result;
  }

  /**
   * Batch fetch usage (agents using each skill) for multiple skills.
   * Keyed by skill sId to avoid collisions (global skills share id: -1).
   */
  static async batchFetchUsage(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, AgentsUsageType>> {
    const agentsBySkillId = await this.batchListActiveAgents(auth, skills);

    const result = new Map<string, AgentsUsageType>();
    for (const skill of skills) {
      const agents = (agentsBySkillId.get(skill.sId) ?? [])
        .map((agent) => ({
          sId: agent.sId,
          name: agent.name,
          pictureUrl: agent.pictureUrl,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      result.set(skill.sId, { count: agents.length, agents });
    }

    return result;
  }

  async addToAgent(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    await AgentSkillModel.create({
      ...this.skillReference,
      workspaceId: workspace.id,
      agentConfigurationId: agentConfiguration.id,
    });
  }

  static async addManyToAgent(
    auth: Authenticator,
    {
      agentConfiguration,
      skills,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      skills: SkillResource[];
    }
  ): Promise<void> {
    if (skills.length === 0) {
      return;
    }

    const workspace = auth.getNonNullableWorkspace();

    await AgentSkillModel.bulkCreate(
      skills.map((skill) => ({
        ...skill.skillReference,
        workspaceId: workspace.id,
        agentConfigurationId: agentConfiguration.id,
      }))
    );
  }

  /**
   * Returns skill references for an agent configuration.
   * For global agents, returns references from the config's skills field.
   * For non-global agents, queries the database.
   * TODO(2026-01-30 agent-resource): move this to an AgentResource that would bundle the logic
   *   about loading skills and will expose a unified interface.
   */
  static async getSkillReferencesForAgent(
    auth: Authenticator,
    agentConfiguration: AgentConfigurationType
  ): Promise<
    {
      customSkillId: ModelId | null;
      globalSkillId: string | null;
    }[]
  > {
    // For global agents, skills are defined in the config, not in the database.
    if (
      isGlobalAgentId(agentConfiguration.sId) &&
      "skills" in agentConfiguration
    ) {
      return (agentConfiguration.skills ?? []).map((globalSkillId) => ({
        customSkillId: null,
        globalSkillId,
      }));
    }

    const workspace = auth.getNonNullableWorkspace();

    const agentSkills = await AgentSkillModel.findAll({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId: workspace.id,
      },
    });

    return agentSkills.map((s) => ({
      customSkillId: s.customSkillId,
      globalSkillId: s.globalSkillId,
    }));
  }

  protected async updateActiveAgentsRequirements(
    auth: Authenticator,
    {
      previousRequestedSpaceIds,
      newRequestedSpaceIds = this.requestedSpaceIds,
    }: {
      // The spaces the skill previously contributed before the change
      previousRequestedSpaceIds: ModelId[];
      // The spaces the skill contributes after the change. Defaults to the
      // skill's current `requestedSpaceIds`, but callers can override it (e.g.
      // archiving treats the skill as contributing no spaces).
      newRequestedSpaceIds?: ModelId[];
    },
    { transaction }: { transaction?: Transaction }
  ): Promise<void> {
    if (
      previousRequestedSpaceIds.length === newRequestedSpaceIds.length &&
      hasAll(previousRequestedSpaceIds, newRequestedSpaceIds)
    ) {
      // Requested spaces didn't change, skip.
      return;
    }

    const agents = await this.listActiveAgents(auth);

    if (agents.length === 0) {
      // No agents are using this skill, skip.
      return;
    }

    const spaceIdsRemovedFromThisSkill = previousRequestedSpaceIds.filter(
      (spaceId) => !newRequestedSpaceIds.includes(spaceId)
    );

    const workspace = auth.getNonNullableWorkspace();
    const agentIds = agents.map((a) => a.id);

    let actionsByAgentModelId = new Map<
      ModelId,
      MCPServerConfigurationType[]
    >();
    let skillByAgentModelId = new Map<ModelId, SkillResource[]>();

    if (spaceIdsRemovedFromThisSkill.length > 0) {
      actionsByAgentModelId = await fetchMCPServerActionConfigurations(auth, {
        configurationIds: agentIds,
        variant: "full",
      });

      const agentSkillModels = await AgentSkillModel.findAll({
        where: {
          agentConfigurationId: { [Op.in]: agentIds },
          workspaceId: workspace.id,
        },
      });

      // We only need to consider custom skills, as global skill have no effect on space requirements.
      const customSkills = await this.fetchSkillsByModelIds(
        auth,
        removeNulls(agentSkillModels.map((skill) => skill.customSkillId))
      );

      const skillByModelId = new Map<ModelId, SkillResource>(
        customSkills.map((skill) => [skill.id, skill])
      );
      for (const agentSkill of agentSkillModels) {
        if (!agentSkill.customSkillId) {
          continue;
        }
        const skill = skillByModelId.get(agentSkill.customSkillId);
        if (!skill) {
          continue;
        }
        const list =
          skillByAgentModelId.get(agentSkill.agentConfigurationId) ?? [];
        list.push(skill);
        skillByAgentModelId.set(agentSkill.agentConfigurationId, list);
      }
    }

    for (const agent of agents) {
      const spaceIdsToRemoveFromAgent = new Set<ModelId>();

      // Some spaces were removed from the skill: we must check if they need to be
      // removed from the agent. In order to achieve this, we check if the agent has
      // any other capabilities that require the removed spaces.
      if (spaceIdsRemovedFromThisSkill.length > 0) {
        const actions = actionsByAgentModelId.get(agent.id) ?? [];
        const otherAgentSkills = (
          skillByAgentModelId.get(agent.id) ?? []
        ).filter((skill) => skill.sId !== this.sId);

        const agentOtherCapabilitiesRequirements =
          await getAgentConfigurationRequirementsFromCapabilities(auth, {
            actions,
            skills: otherAgentSkills,
          });

        const otherCapabilitiesRequestedSpaceIds = new Set(
          agentOtherCapabilitiesRequirements.requestedSpaceIds
        );

        for (const spaceId of spaceIdsRemovedFromThisSkill) {
          if (!otherCapabilitiesRequestedSpaceIds.has(spaceId)) {
            // This space is not required by any other capabilities of the agent, so
            // we must remove it from the config.
            spaceIdsToRemoveFromAgent.add(spaceId);
          }
        }
      }

      const newSpaceIds = uniq(
        agent.requestedSpaceIds
          .filter((id) => !spaceIdsToRemoveFromAgent.has(id))
          .concat(newRequestedSpaceIds)
      );

      await updateAgentRequirements(
        auth,
        {
          agentModelId: agent.id,
          newSpaceIds,
        },
        { transaction }
      );
    }
  }
}
