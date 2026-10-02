import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillHydrationOptions } from "@app/lib/resources/skill/types";
import type {
  AgentConfigurationWithSkillsType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import { removeNulls } from "@app/types/shared/utils/general";
import partition from "lodash/partition";
import uniq from "lodash/uniq";

const LABELS_ONLY_FETCH_OPTIONS: SkillHydrationOptions = {
  withInstructions: false,
  withTools: false,
  withFileAttachments: false,
};

export async function getAgentIdFromName(
  auth: Authenticator,
  name: string
): Promise<string | null> {
  const owner = auth.getNonNullableWorkspace();

  const agent = await AgentConfigurationModel.findOne({
    attributes: ["sId"],
    where: {
      workspaceId: owner.id,
      name,
      status: "active",
    },
  });

  if (!agent) {
    return null;
  }

  return agent.sId;
}

// Identifies one agent configuration: an agent id alone spans every version of that agent.
const configurationKey = (
  agent: Pick<LightAgentConfigurationType, "sId" | "version">
): string => `${agent.sId}-${agent.version}`;

/**
 * @cc [owner:fabiencelier,label:security] no-skills-for-redacted-agents
 * An agent whose details were redacted (`canRead === false`) MUST get an empty `skills` array:
 * its skills are private, consistently with the redacted serialization (`agent-json-redaction`).
 */
export async function toAgentConfigurationsWithSkills(
  auth: Authenticator,
  // `codeDefinedSkillIds` is declared on the full configuration schema, but `getGlobalAgents`
  // puts it on global agents in every variant, so light configurations carry it too.
  agents: (LightAgentConfigurationType & { codeDefinedSkillIds?: string[] })[]
): Promise<AgentConfigurationWithSkillsType[]> {
  const readableAgents = agents.filter((agent) => agent.canRead);

  // Workspace agents hold `AgentSkillModel` rows; global agents declare their skills in code.
  const [globalAgents, workspaceAgents] = partition(readableAgents, (agent) =>
    isGlobalAgentId(agent.sId)
  );

  // Only `sId` and `name` reach the wire, so skip the instructions, tools and file attachments:
  // see the `labels-only-skips-dynamic-instructions` contract.
  const [workspaceAgentSkills, codeDefinedSkills] = await Promise.all([
    SkillResource.listByAgentConfigurationModelIds(
      auth,
      workspaceAgents.map((agent) => agent.id),
      LABELS_ONLY_FETCH_OPTIONS
    ),
    SkillResource.fetchByIds(
      auth,
      uniq(globalAgents.flatMap((agent) => agent.codeDefinedSkillIds ?? [])),
      LABELS_ONLY_FETCH_OPTIONS
    ),
  ]);

  // Keyed per configuration, not per agent: an agent has one row per version and callers can
  // pass several of them. `version` is unique within an agent id, and the
  // version is a number, so the two parts cannot run together ambiguously.
  const skillsByConfiguration: Record<string, SkillResource[]> = {};
  for (const agent of workspaceAgents) {
    skillsByConfiguration[configurationKey(agent)] =
      workspaceAgentSkills.get(agent.id) ?? [];
  }

  const codeDefinedSkillById = new Map(
    codeDefinedSkills.map((skill) => [skill.sId, skill])
  );
  for (const agent of globalAgents) {
    skillsByConfiguration[configurationKey(agent)] = removeNulls(
      (agent.codeDefinedSkillIds ?? []).map(
        (skillId) => codeDefinedSkillById.get(skillId) ?? null
      )
    );
  }

  // `codeDefinedSkillIds` does not reach the wire: the resolved `skills` replace it.
  return agents.map(
    ({ codeDefinedSkillIds: _codeDefinedSkillIds, ...agent }) => ({
      ...agent,
      skills: agent.canRead
        ? (skillsByConfiguration[configurationKey(agent)] ?? []).map((skill) =>
            skill.toAgentSkillJSON()
          )
        : [],
    })
  );
}
