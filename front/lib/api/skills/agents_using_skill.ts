import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentsUsageType } from "@app/types/data_source";

/**
 * @cc [owner:avervaet,label:security;product] agents-using-skill-visibility
 * An agent MUST be listed only if the caller holds a verb on it: a member MUST NOT see an agent
 * they do not edit that is hidden or requests a space they cannot read.
 */
export async function listAgentsUsingSkill(
  auth: Authenticator,
  skill: SkillResource
): Promise<AgentsUsageType> {
  const reference = skill.skillReference;
  const agents = await AgentResource.listBySkills(
    auth,
    "globalSkillId" in reference
      ? { globalSkillIds: [reference.globalSkillId] }
      : { customSkillModelIds: [reference.customSkillId] }
  );

  return AgentResource.toAgentsUsageJSON(
    agents.filter((agent) => agent.status === "active")
  );
}
