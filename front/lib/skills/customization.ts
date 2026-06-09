import { generateShortBlockId } from "@app/lib/generate_short_block_id";
import {
  extractUniqueSkillReferenceIds,
  serializeSkillTag,
} from "@app/lib/skills/format";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import * as cheerio from "cheerio";

const CUSTOMIZED_SKILL_LABEL = "This skill is a customization of";
const CUSTOMIZED_SKILL_SEPARATOR = "---";

type BaseSkill = {
  sId: string;
  icon: string | null;
  name: string;
};

function hasSkillReference(content: string, skillId: string): boolean {
  return extractUniqueSkillReferenceIds(content).includes(skillId);
}

function prependHtmlReference({
  baseSkill,
  instructionsHtml,
}: {
  baseSkill: BaseSkill;
  instructionsHtml: string;
}): string {
  const renderedSkill = serializeSkillTag(
    {
      id: baseSkill.sId,
      icon: baseSkill.icon,
      name: baseSkill.name,
    },
    { html: true }
  );
  const paragraph = `<p data-block-id="${generateShortBlockId()}">${CUSTOMIZED_SKILL_LABEL} ${renderedSkill}</p>`;
  const separator = `<p data-block-id="${generateShortBlockId()}">${CUSTOMIZED_SKILL_SEPARATOR}</p>`;
  const $ = cheerio.load(instructionsHtml, { xmlMode: false }, false);
  const root = $(
    `[data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`
  ).first();

  if (root.length > 0) {
    root.prepend(`${paragraph}${separator}`);
    return $.html();
  }

  return `${paragraph}\n${separator}\n${instructionsHtml}`;
}

export function prependBaseSkillReference({
  baseSkill,
  instructions,
  instructionsHtml,
}: {
  baseSkill: BaseSkill;
  instructions: string;
  instructionsHtml: string | null;
}): {
  instructions: string;
  instructionsHtml: string | null;
} {
  const renderedSkill = serializeSkillTag({
    id: baseSkill.sId,
    icon: baseSkill.icon,
    name: baseSkill.name,
  });

  return {
    instructions: hasSkillReference(instructions, baseSkill.sId)
      ? instructions
      : `${CUSTOMIZED_SKILL_LABEL} ${renderedSkill}\n${CUSTOMIZED_SKILL_SEPARATOR}\n${instructions}`,
    instructionsHtml:
      instructionsHtml !== null &&
      !hasSkillReference(instructionsHtml, baseSkill.sId)
        ? prependHtmlReference({ baseSkill, instructionsHtml })
        : instructionsHtml,
  };
}
