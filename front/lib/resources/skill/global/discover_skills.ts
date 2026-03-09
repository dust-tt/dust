import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const discoverSkillsSkill = {
  sId: "discover_skills",
  name: "Discover Skills",
  userFacingDescription:
    "Automatically discover and activate workspace skills as needed.",
  agentFacingDescription:
    "List available workspace skills and enable them for the current conversation.",
  instructions:
    "Workspace skills marked as available will appear alongside agent-configured skills. " +
    "Enable them the same way you would any other available skill.",
  version: 1,
  icon: "PuzzleIcon",
  isAutoEnabled: true,
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth.getNonNullableWorkspace());

    return !flags.includes("discover_skills");
  },
} as const satisfies GlobalSkillDefinition;
