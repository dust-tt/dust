import { BUILDING_AGENTS_AND_SKILLS_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

// TODO(conversational-building): fill this skill with useful instructions.
const CONVERSATIONAL_BUILDING_INSTRUCTIONS = `
You can propose improvements to the workspace's Skills from within a conversation.

Changes are never applied directly: suggest_skill_update records a suggestion that the skill's editors review, accept, or reject.
Print the output of the tool call verbatim in the conversation for the user to see the suggestion.
`.trim();

export const conversationalBuildingSkill = {
  sId: "conversational-building",
  kind: "global",
  name: "Build Agents and Skills",
  userFacingDescription:
    "Let this agent propose improvements to your Skills from a conversation, as suggestions for their editors to review.",
  agentFacingDescription:
    "Create, manage and do any kind of updates on skill and agents",
  instructions: CONVERSATIONAL_BUILDING_INSTRUCTIONS,
  mcpServers: [{ name: BUILDING_AGENTS_AND_SKILLS_SERVER_NAME }],
  version: 1,
  icon: "ActionListCheckIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !flags.includes("conversational_building");
  },
} as const satisfies GlobalSkillDefinition;
