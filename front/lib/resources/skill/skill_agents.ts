import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillReferenceFields } from "@app/lib/resources/skill/types";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import { Op } from "sequelize";

export type SkillWithReference = {
  skill: SkillResource;
  reference: SkillReferenceFields;
};

export async function listActiveAgents(
  auth: Authenticator,
  skillReference: SkillReferenceFields
): Promise<AgentConfigurationModel[]> {
  const workspace = auth.getNonNullableWorkspace();

  const agentSkills = await AgentSkillModel.findAll({
    where: {
      ...skillReference,
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

export async function fetchUsage(
  auth: Authenticator,
  skillReference: SkillReferenceFields
): Promise<AgentsUsageType> {
  const agents = await listActiveAgents(auth, skillReference);

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
async function batchListActiveAgents(
  auth: Authenticator,
  skills: SkillWithReference[]
): Promise<Map<string, AgentConfigurationModel[]>> {
  if (skills.length === 0) {
    return new Map();
  }

  const workspace = auth.getNonNullableWorkspace();

  // Separate custom skills from global skills.
  const customSkillIds = removeNulls(
    skills.map(({ reference }) =>
      "customSkillId" in reference ? reference.customSkillId : null
    )
  );
  const globalSkillIds = removeNulls(
    skills.map(({ reference }) =>
      "globalSkillId" in reference ? reference.globalSkillId : null
    )
  );

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
  const sIdByCustomId = new Map<ModelId, string>();
  for (const { skill, reference } of skills) {
    if ("customSkillId" in reference) {
      sIdByCustomId.set(reference.customSkillId, skill.sId);
    }
  }

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
export async function batchFetchUsage(
  auth: Authenticator,
  skills: SkillWithReference[]
): Promise<Map<string, AgentsUsageType>> {
  const agentsBySkillId = await batchListActiveAgents(auth, skills);

  const result = new Map<string, AgentsUsageType>();
  for (const { skill } of skills) {
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

export async function addToAgent(
  auth: Authenticator,
  {
    skillReference,
    agentConfiguration,
  }: {
    skillReference: SkillReferenceFields;
    agentConfiguration: LightAgentConfigurationType;
  }
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  await AgentSkillModel.create({
    ...skillReference,
    workspaceId: workspace.id,
    agentConfigurationId: agentConfiguration.id,
  });
}

export async function addManyToAgent(
  auth: Authenticator,
  {
    agentConfiguration,
    skillReferences,
  }: {
    agentConfiguration: LightAgentConfigurationType;
    skillReferences: SkillReferenceFields[];
  }
): Promise<void> {
  if (skillReferences.length === 0) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();

  await AgentSkillModel.bulkCreate(
    skillReferences.map((skillReference) => ({
      ...skillReference,
      workspaceId: workspace.id,
      agentConfigurationId: agentConfiguration.id,
    }))
  );
}
