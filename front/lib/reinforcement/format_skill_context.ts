import type { SkillType } from "@app/types/assistant/skill_configuration";
import { escapeXml } from "@app/types/shared/utils/string_utils";

export function formatSkillContext(skill: SkillType): string {
  const toolsBlock =
    skill.tools.length > 0
      ? `<tools>${skill.tools
          .map(
            (t) =>
              `<tool sId="${escapeXml(t.sId)}" name="${escapeXml(t.name ?? "")}"/>`
          )
          .join("")}</tools>`
      : "";

  const descBlock = skill.agentFacingDescription
    ? `<agentFacingDescription>${escapeXml(skill.agentFacingDescription)}</agentFacingDescription>`
    : "";

  const instructionsBlock = skill.instructionsHtml
    ? `<instructions format="html">${skill.instructionsHtml}</instructions>`
    : "";

  return `<skill ID="${escapeXml(skill.sId)}" name="${escapeXml(skill.name)}">${toolsBlock}${descBlock}${instructionsBlock}</skill>`;
}
