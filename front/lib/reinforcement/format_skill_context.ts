import type { SkillType } from "@app/types/assistant/skill_configuration";

export function formatSkillContext(skill: SkillType): string {
  const sections: string[] = [];

  sections.push(`## Skill: ${skill.name} (ID: ${skill.sId})`);

  if (skill.agentFacingDescription) {
    sections.push(`Description: ${skill.agentFacingDescription}`);
  }

  if (skill.instructions) {
    sections.push(`### Current instructions\n${skill.instructions}`);
  }

  if (skill.tools.length > 0) {
    const toolLines = skill.tools
      .map((t) => `- ${t.name} (ID: ${t.sId})`)
      .join("\n");
    sections.push(
      `### Configured tools\n${skill.tools.length} tools configured.\n\n${toolLines}`
    );
  }

  return sections.join("\n\n");
}
