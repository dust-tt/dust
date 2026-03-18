import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";

export function formatAgentContext(
  agentConfig: AgentConfigurationType,
  agentSkills: SkillResource[]
): string {
  const sections: string[] = [];

  const descriptionSection = agentConfig.description
    ? `Description: ${agentConfig.description}`
    : "";
  const instructionsSection = agentConfig.instructionsHtml
    ? `\n### Current instructions\n${agentConfig.instructionsHtml}`
    : "";

  sections.push(
    `## Agent being analyzed\nName: ${agentConfig.name}\n${descriptionSection}${instructionsSection}`
  );

  // Only list names and IDs here — descriptions are already included in the
  // workspace-level tools/skills context (buildToolsAndSkillsContext).
  if (agentConfig.actions.length > 0) {
    const toolLines = agentConfig.actions
      .map((a) => `- ${a.name} (ID: ${a.sId})`)
      .join("\n");
    sections.push(
      `## Agent's configured tools\n${agentConfig.actions.length} tools configured.\n\n${toolLines}`
    );
  }

  if (agentSkills.length > 0) {
    const skillLines = agentSkills
      .map((s) => `- ${s.name} (ID: ${s.sId})`)
      .join("\n");
    sections.push(
      `## Agent's configured skills\n${agentSkills.length} skills configured.\n\n${skillLines}`
    );
  }

  return sections.join("\n\n");
}
