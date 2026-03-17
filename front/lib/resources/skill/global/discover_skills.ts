import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

// This skill allows discovering skills from the workspace. When equipped on an
// agent, it causes `listForAgentLoop` to include discoverable skills (custom
// default skills + non-auto-enabled global skills) in the equipped skills list.
export const discoverSkillsSkill = {
  sId: "discover_skills",
  name: "Discover Skills",
  userFacingDescription:
    "Automatically discover and activate workspace skills as needed.",
  agentFacingDescription:
    "List available workspace skills and enable them for the current conversation.",
  instructions:
    "Some of the available skills listed below come from the workspace rather than " +
    "this agent's configuration. They can be enabled exactly like any other available skill.",
  version: 1,
  icon: "PuzzleIcon",
  isAutoEnabled: true,
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !flags.includes("discover_skills");
  },
} as const satisfies GlobalSkillDefinition;
