import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isSkillVisibleToViewer } from "@app/types/assistant/skill_configuration";
import type { AgentsAndSkillsUsageType } from "@app/types/data_source";

const SKILL_FETCH_OPTIONS = {
  withInstructions: false,
  withTools: false,
  withFileAttachments: false,
};

async function fetchVisibleSkills(
  auth: Authenticator,
  skillIds: string[],
  { onlyActive }: { onlyActive: boolean }
): Promise<SkillResource[]> {
  const skills = await SkillResource.fetchByIds(auth, skillIds, {
    ...SKILL_FETCH_OPTIONS,
    onlyActive,
  });
  return skills.filter((skill) =>
    isSkillVisibleToViewer({
      availability: skill.availability,
      viewerCanWrite: auth.can("write", skill),
    })
  );
}

/**
 * @cc [owner:sfriquet,label:security;product] used-by-visible-to-caller
 * Returns usage only for requested skills the caller can see (readable and not editors-only unless
 * the caller can write them); other requested IDs are absent from the result.
 * Listed agents MUST be active agents the caller holds `read` on, and listed parent skills MUST be
 * active skills the caller can see. `count` MUST equal the number of listed agents and skills.
 */
export async function fetchSkillsUsedBy(
  auth: Authenticator,
  skillIds: string[]
): Promise<Record<string, AgentsAndSkillsUsageType>> {
  const skills = await fetchVisibleSkills(auth, skillIds, {
    onlyActive: false,
  });
  if (skills.length === 0) {
    return {};
  }

  const [agentsUsage, usedBySkills] = await Promise.all([
    SkillResource.batchFetchUsage(auth, skills),
    SkillResource.batchFetchUsedBySkills(auth, skills),
  ]);

  const [readableAgents, visibleParentSkills] = await Promise.all([
    AgentResource.fetchByIds(
      auth,
      [...agentsUsage.values()].flatMap(({ agents }) =>
        agents.map((agent) => agent.sId)
      )
    ).then((agents) => agents.filter((agent) => auth.can("read", agent))),
    fetchVisibleSkills(
      auth,
      [...usedBySkills.values()].flatMap((parents) =>
        parents.map((parent) => parent.sId)
      ),
      { onlyActive: true }
    ),
  ]);
  const readableAgentIds = new Set(readableAgents.map((agent) => agent.sId));
  const visibleParentSkillIds = new Set(
    visibleParentSkills.map((skill) => skill.sId)
  );

  return Object.fromEntries(
    skills.map((skill) => {
      const agents = (agentsUsage.get(skill.sId)?.agents ?? []).filter(
        ({ sId }) => readableAgentIds.has(sId)
      );
      const parentSkills = (usedBySkills.get(skill.sId) ?? []).filter(
        (parent) => visibleParentSkillIds.has(parent.sId)
      );
      return [
        skill.sId,
        {
          count: agents.length + parentSkills.length,
          agents,
          skills: parentSkills,
        },
      ];
    })
  );
}
