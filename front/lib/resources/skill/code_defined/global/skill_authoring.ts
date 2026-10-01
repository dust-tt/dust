import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { conversationalBuildingSkill } from "@app/lib/resources/skill/code_defined/global/conversational_building";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const ENABLE_SKILL_TOOL = getPrefixedToolName(
  SKILL_MANAGEMENT_SERVER_NAME,
  ENABLE_SKILL_TOOL_NAME
);

const DEPRECATION_NOTICE = `Deprecated: use the "${conversationalBuildingSkill.name}" skill instead.`;

const SKILL_AUTHORING_INSTRUCTIONS = `
This skill is a legacy way to build skills. Use the <skill id="${conversationalBuildingSkill.sId}" name="${conversationalBuildingSkill.name}" /> skill instead.

Before doing anything else, call \`${ENABLE_SKILL_TOOL}\` with \`skillName\` exactly \`${conversationalBuildingSkill.name}\`, then follow its instructions.
`.trim();

export const skillAuthoringSkill = {
  sId: "skill-authoring",
  kind: "global",
  name: "Author Skills",
  userFacingDescription: `${DEPRECATION_NOTICE} Let this agent create and refine reusable Skills for your workspace.`,
  agentFacingDescription: `${DEPRECATION_NOTICE} Create and update reusable Skills (named, reusable instruction sets).`,
  instructions: SKILL_AUTHORING_INSTRUCTIONS,
  mcpServers: [{ name: "skill_authoring" }],
  version: 2,
  icon: "ActionListIcon",
} as const satisfies GlobalSkillDefinition;
