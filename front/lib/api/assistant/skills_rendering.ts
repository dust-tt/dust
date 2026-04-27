import {
  ENABLE_SKILL_TOOL_NAME,
  TOOL_NAME_SEPARATOR,
} from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserMessageTypeModel } from "@app/types/assistant/generation";

function renderSystemSkillMessage(text: string): UserMessageTypeModel {
  return {
    role: "user",
    name: "system",
    content: [{ type: "text", text }],
  };
}

export function renderEquippedSkillsUserMessage(
  equippedSkills: SkillResource[]
): UserMessageTypeModel | null {
  if (equippedSkills.length === 0) {
    return null;
  }

  const enableSkillToolName = `${SKILL_MANAGEMENT_SERVER_NAME}${TOOL_NAME_SEPARATOR}${ENABLE_SKILL_TOOL_NAME}`;
  const lines = equippedSkills.map(
    ({ name, agentFacingDescription }) =>
      `- **${name}**: ${agentFacingDescription}`
  );

  return renderSystemSkillMessage(
    `<dust_system>\n` +
      `The following skills are available for use with the ${enableSkillToolName} tool:\n\n` +
      `${lines.join("\n")}\n` +
      `</dust_system>`
  );
}
