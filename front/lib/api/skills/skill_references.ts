import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  extractUniqueSkillIds,
  parseSkillTag,
  SKILL_TAG_REGEX,
  serializeUnavailableSkillTag,
} from "@app/lib/skills/format";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export type SkillInstructionsOverride = {
  instructionsOverride?: string;
};

export async function getUnavailableSkillReferenceIds(
  auth: Authenticator,
  contents: (string | null | undefined)[]
): Promise<Set<string>> {
  const skillIds = [
    ...new Set(
      contents.flatMap((content) => extractUniqueSkillIds(content ?? ""))
    ),
  ];

  if (skillIds.length === 0) {
    return new Set();
  }

  const accessibleSkills = await SkillResource.fetchByIds(auth, skillIds);
  const accessibleSkillIds = new Set(
    accessibleSkills.map((skill) => skill.sId)
  );

  return new Set(
    skillIds.filter((skillId) => !accessibleSkillIds.has(skillId))
  );
}

export function replaceUnavailableSkillReferences(
  content: string,
  unavailableSkillIds: ReadonlySet<string>,
  { html = false }: { html?: boolean } = {}
): string {
  if (unavailableSkillIds.size === 0) {
    return content;
  }

  return content.replace(SKILL_TAG_REGEX, (tag) => {
    const skill = parseSkillTag(tag);

    if (!skill || !unavailableSkillIds.has(skill.id)) {
      return tag;
    }

    return serializeUnavailableSkillTag({ id: skill.id }, { html });
  });
}

export async function replaceUnavailableSkillReferencesForFrontend(
  auth: Authenticator,
  skill: SkillType
): Promise<SkillType> {
  const unavailableSkillIds = await getUnavailableSkillReferenceIds(auth, [
    skill.instructions,
    skill.instructionsHtml,
  ]);

  if (unavailableSkillIds.size === 0) {
    return skill;
  }

  return {
    ...skill,
    instructions: skill.instructions
      ? replaceUnavailableSkillReferences(
          skill.instructions,
          unavailableSkillIds
        )
      : skill.instructions,
    instructionsHtml: skill.instructionsHtml
      ? replaceUnavailableSkillReferences(
          skill.instructionsHtml,
          unavailableSkillIds,
          {
            html: true,
          }
        )
      : skill.instructionsHtml,
  };
}
