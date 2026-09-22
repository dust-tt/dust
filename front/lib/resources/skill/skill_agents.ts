import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { updateAgentRequirements } from "@app/lib/api/assistant/configuration/agent_requirements";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import type { Authenticator } from "@app/lib/auth";
import { hasAll } from "@app/lib/matcher/operators/array";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { getSkillReference } from "@app/lib/resources/skill/skill_references";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  SkillFetchContext,
  SkillHydrationOptions,
  SkillReferenceFetcher,
} from "@app/lib/resources/skill/types";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { AgentsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import groupBy from "lodash/groupBy";
import uniq from "lodash/uniq";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

type AgentUsageAttributes = Pick<
  Attributes<AgentConfigurationModel>,
  "id" | "sId" | "name" | "pictureUrl" | "requestedSpaceIds"
>;

export async function listByAgentConfiguration(
  resourceClass: typeof SkillResource,
  fetchReferencedSkills: SkillReferenceFetcher,
  auth: Authenticator,
  agentConfiguration: AgentLoopExecutionData["agentConfiguration"],
  fetchContext: SkillFetchContext = {}
): Promise<SkillResource[]> {
  // Global agents hold no `AgentSkillModel` row: their skills are declared in code.
  if (isGlobalAgentId(agentConfiguration.sId)) {
    return resourceClass.fetchByIds(
      auth,
      agentConfiguration.codeDefinedSkillIds ?? [],
      fetchContext
    );
  }

  const refs = await getSkillReferencesByAgentConfigurationModelId(
    auth,
    agentConfiguration.id
  );

  if (refs.length === 0) {
    return [];
  }

  return fetchReferencedSkills(auth, refs, fetchContext);
}

export async function listByAgentConfigurationModelId(
  fetchReferencedSkills: SkillReferenceFetcher,
  auth: Authenticator,
  agentConfigurationModelId: ModelId,
  {
    agentLoopData,
    effectiveSpaceIds,
    permissionFiltering,
  }: SkillFetchContext = {}
): Promise<SkillResource[]> {
  const refs = await getSkillReferencesByAgentConfigurationModelId(
    auth,
    agentConfigurationModelId
  );

  if (refs.length === 0) {
    return [];
  }

  return fetchReferencedSkills(auth, refs, {
    agentLoopData,
    effectiveSpaceIds,
    permissionFiltering,
  });
}

export async function listByAgentConfigurations<
  T extends LightAgentConfigurationType,
>(
  fetchReferencedSkills: SkillReferenceFetcher,
  auth: Authenticator,
  agentConfigurations: T[],
  fetchOptions?: SkillHydrationOptions
): Promise<{ agentConfiguration: T; skill: SkillResource }[]> {
  assert(
    agentConfigurations.every((c) => !isGlobalAgentId(c.sId)),
    "Global agents are not supported"
  );

  if (agentConfigurations.length === 0) {
    return [];
  }

  const workspace = auth.getNonNullableWorkspace();

  // Fetch all agent-skill relationships for the given agents.
  const agentSkills = await AgentSkillModel.findAll({
    where: {
      agentConfigurationId: agentConfigurations.map((c) => c.id),
      workspaceId: workspace.id,
    },
  });

  if (agentSkills.length === 0) {
    return [];
  }

  // Fetch all unique skills in one batch.
  const allSkills = await fetchReferencedSkills(
    auth,
    agentSkills.map((s) => ({
      customSkillId: s.customSkillId,
      globalSkillId: s.globalSkillId,
    })),
    fetchOptions
  );

  const skillByCustomId = new Map<ModelId, SkillResource>();
  const skillByGlobalId = new Map<string, SkillResource>();
  for (const skill of allSkills) {
    if (skill.kind !== "custom") {
      skillByGlobalId.set(skill.sId, skill);
    } else {
      skillByCustomId.set(skill.id, skill);
    }
  }

  // Map skills back to each config.
  const configById = new Map(agentConfigurations.map((c) => [c.id, c]));
  return removeNulls(
    Object.entries(groupBy(agentSkills, (s) => s.agentConfigurationId)).flatMap(
      ([configId, refs]) => {
        const agentConfiguration = configById.get(parseInt(configId, 10));
        if (!agentConfiguration) {
          return [];
        }
        return refs.map((ref) => {
          if (ref.globalSkillId) {
            const skill = skillByGlobalId.get(ref.globalSkillId);
            return skill ? { agentConfiguration, skill } : null;
          } else if (ref.customSkillId) {
            const skill = skillByCustomId.get(ref.customSkillId);
            return skill ? { agentConfiguration, skill } : null;
          }
        });
      }
    )
  );
}

/**
 * @cc [owner:sfriquet,label:backend] skill-references-by-configuration-model-id
 * `agentConfigurationModelId` MUST designate an `agent_configurations` row: an `AgentResource`
 * passes its `agentConfigurationModelId`, NOT its `id`, which designates the `agents` row. Global
 * agents MUST NOT be passed: they hold no `AgentSkillModel` row and share the `id: -1` sentinel
 * (see `agent-resource-identity`), so their code-defined skills are resolved by `fetchByIds` on
 * the ids their configuration declares instead.
 */
async function getSkillReferencesByAgentConfigurationModelId(
  auth: Authenticator,
  agentConfigurationModelId: ModelId
): Promise<
  {
    customSkillId: ModelId | null;
    globalSkillId: string | null;
  }[]
> {
  const agentSkills = await AgentSkillModel.findAll({
    where: {
      agentConfigurationId: agentConfigurationModelId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  return agentSkills.map((s) => ({
    customSkillId: s.customSkillId,
    globalSkillId: s.globalSkillId,
  }));
}

async function listActiveAgents(
  skillResource: SkillResource,
  auth: Authenticator
): Promise<AgentUsageAttributes[]> {
  const workspace = auth.getNonNullableWorkspace();

  const agentSkills = await AgentSkillModel.findAll({
    attributes: ["agentConfigurationId"],
    where: {
      ...getSkillReference(skillResource),
      workspaceId: workspace.id,
    },
  });

  if (agentSkills.length === 0) {
    return [];
  }

  const agentConfigIds = agentSkills.map((as) => as.agentConfigurationId);

  return AgentConfigurationModel.findAll({
    attributes: ["id", "sId", "name", "pictureUrl", "requestedSpaceIds"],
    where: {
      id: { [Op.in]: agentConfigIds },
      workspaceId: workspace.id,
      status: "active",
    },
  });
}

export async function fetchUsage(
  skillResource: SkillResource,
  auth: Authenticator
): Promise<AgentsUsageType> {
  const agents = await listActiveAgents(skillResource, auth);

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

export async function updateActiveAgentsRequirements(
  resourceClass: typeof SkillResource,
  skillResource: SkillResource,
  auth: Authenticator,
  {
    previousRequestedSpaceIds,
    newRequestedSpaceIds = skillResource.requestedSpaceIds,
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

  const agents = await listActiveAgents(skillResource, auth);

  if (agents.length === 0) {
    // No agents are using this skill, skip.
    return;
  }

  const spaceIdsRemovedFromThisSkill = previousRequestedSpaceIds.filter(
    (spaceId) => !newRequestedSpaceIds.includes(spaceId)
  );

  const workspace = auth.getNonNullableWorkspace();
  const agentModelIds = agents.map((a) => a.id);

  let actionsByAgentModelId = new Map<ModelId, MCPServerConfigurationType[]>();
  let skillByAgentModelId = new Map<ModelId, SkillResource[]>();

  if (spaceIdsRemovedFromThisSkill.length > 0) {
    actionsByAgentModelId = await fetchMCPServerActionConfigurations(auth, {
      configurationModelIds: agentModelIds,
      variant: "full",
    });

    const agentSkillModels = await AgentSkillModel.findAll({
      where: {
        agentConfigurationId: { [Op.in]: agentModelIds },
        workspaceId: workspace.id,
      },
    });

    // We only need to consider custom skills, as global skill have no effect on space requirements.
    const customSkills = await resourceClass.fetchByModelIds(
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
      const otherAgentSkills = (skillByAgentModelId.get(agent.id) ?? []).filter(
        (skill) => skill.sId !== skillResource.sId
      );

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

/**
 * Batch version of listActiveAgents, returns active agents grouped by skill sId.
 */
async function batchListActiveAgents(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<Map<string, AgentUsageAttributes[]>> {
  if (skills.length === 0) {
    return new Map();
  }

  const workspace = auth.getNonNullableWorkspace();

  // Separate custom skills from global skills.
  const customSkillIds = removeNulls(
    skills.map((s) => (s.kind !== "custom" ? null : s.id))
  );
  const globalSkillIds = removeNulls(
    skills.map((s) => (s.kind === "custom" ? null : s.sId))
  );

  // Single query: all agent-skill associations for the given skills.
  const agentSkills = await AgentSkillModel.findAll({
    attributes: ["agentConfigurationId", "customSkillId", "globalSkillId"],
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
    attributes: ["id", "sId", "name", "pictureUrl", "requestedSpaceIds"],
    where: {
      id: { [Op.in]: uniqueAgentConfigIds },
      workspaceId: workspace.id,
      status: "active",
    },
  });

  const agentConfigById = new Map(agentConfigs.map((a) => [a.id, a]));

  // Map AgentSkillModel references back to skill sId.
  const skillIdByModelId = new Map(
    skills.filter((s) => s.kind === "custom").map((s) => [s.id, s.sId])
  );

  const result = new Map<string, AgentUsageAttributes[]>();
  for (const as of agentSkills) {
    const skillId = as.customSkillId
      ? skillIdByModelId.get(as.customSkillId)
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

export async function batchFetchUsage(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<Map<string, AgentsUsageType>> {
  const agentsBySkillId = await batchListActiveAgents(auth, skills);

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

export async function addToAgent(
  skillResource: SkillResource,
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  await AgentSkillModel.create({
    ...getSkillReference(skillResource),
    workspaceId: workspace.id,
    agentConfigurationId: agentConfiguration.id,
  });
}

export async function addManyToAgent(
  auth: Authenticator,
  {
    agentResource,
    skills,
  }: {
    agentResource: AgentResource;
    skills: SkillResource[];
  },
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  if (skills.length === 0) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();

  await AgentSkillModel.bulkCreate(
    skills.map((skill) => ({
      ...getSkillReference(skill),
      workspaceId: workspace.id,
      agentConfigurationId: agentResource.agentConfigurationModelId,
    })),
    { transaction }
  );
}
