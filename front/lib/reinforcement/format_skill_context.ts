import { stripSkillTagPresentationAttributes } from "@app/lib/skills/format";
import { stripToolTagPresentationAttributes } from "@app/lib/tools/format";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { escapeXml } from "@app/types/shared/utils/string_utils";

export function formatSkillContext(
  skill: SkillType,
  content: "light" | "full"
): string {
  const userDescBlock =
    content === "full" && skill.userFacingDescription
      ? `<userFacingDescription>${escapeXml(skill.userFacingDescription)}</userFacingDescription>`
      : "";

  const descBlock = skill.agentFacingDescription
    ? `<agentFacingDescription>${escapeXml(skill.agentFacingDescription)}</agentFacingDescription>`
    : "";

  const instructionsBlock = skill.instructionsHtml
    ? `<instructions format="html">${stripSkillTagPresentationAttributes(
        stripToolTagPresentationAttributes(skill.instructionsHtml)
      )}</instructions>`
    : "";

  const filesBlock =
    content === "full" && skill.fileAttachments.length > 0
      ? `<files>${skill.fileAttachments
          .map(
            (file) =>
              `<file ID="${file.fileId}" name="${escapeXml(file.fileName)}"/>`
          )
          .join("")}</files>`
      : "";

  const settingsAttrs =
    content === "full"
      ? ` availability="${skill.availability}" reinforcement="${skill.reinforcement}"`
      : "";

  return `<skill ID="${escapeXml(skill.sId)}" name="${escapeXml(skill.name)}"${settingsAttrs}>${userDescBlock}${descBlock}${instructionsBlock}${filesBlock}</skill>`;
}
