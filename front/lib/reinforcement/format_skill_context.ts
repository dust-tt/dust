import { stripSkillTagPresentationAttributes } from "@app/lib/skills/format";
import { stripToolTagPresentationAttributes } from "@app/lib/tools/format";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { escapeXml } from "@app/types/shared/utils/string_utils";

export function formatSkillContext(skill: SkillType): string {
  const descBlock = skill.agentFacingDescription
    ? `<agentFacingDescription>${escapeXml(skill.agentFacingDescription)}</agentFacingDescription>`
    : "";

  const instructionsBlock = skill.instructionsHtml
    ? `<instructions format="html">${stripSkillTagPresentationAttributes(
        stripToolTagPresentationAttributes(skill.instructionsHtml)
      )}</instructions>`
    : "";

  return `<skill ID="${escapeXml(skill.sId)}" name="${escapeXml(skill.name)}">${descBlock}${instructionsBlock}</skill>`;
}
