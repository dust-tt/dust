import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type {
  FetchInstructionsContext,
  GlobalSkillDefinition,
} from "@app/lib/resources/skill/global/registry";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";

function buildDiscoverSkillsInstructions(
  defaultSkills: SkillResource[]
): string {
  if (defaultSkills.length === 0) {
    return "No workspace skills are currently available for discovery.";
  }

  const skillList = defaultSkills
    .map(
      ({ name, agentFacingDescription }) =>
        `- **${name}**: ${agentFacingDescription}`
    )
    .join("\n");

  return `<discover_skills_guidelines>
The following workspace skills are available to enable for this conversation.
Enable relevant skills using the \`enable_skill\` tool when a user's request matches a skill's purpose.

<available_workspace_skills>
${skillList}
</available_workspace_skills>
</discover_skills_guidelines>`;
}

export const discoverSkillsSkill = {
  sId: "discover_skills",
  name: "Discover Skills",
  userFacingDescription:
    "Automatically discover and activate workspace skills as needed.",
  agentFacingDescription:
    "List available workspace skills and enable them for the current conversation.",
  fetchInstructions: async (
    _auth: Authenticator,
    _spaceIds: string[],
    { listDefaultSkills }: FetchInstructionsContext
  ) => {
    const defaultSkills = await listDefaultSkills();

    return buildDiscoverSkillsInstructions(defaultSkills);
  },
  version: 1,
  icon: "PuzzleIcon",
  isAutoEnabled: true,
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth.getNonNullableWorkspace());

    return !flags.includes("discover_skills");
  },
} as const satisfies GlobalSkillDefinition;
