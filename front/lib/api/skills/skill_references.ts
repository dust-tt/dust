import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  extractUniqueSkillIds,
  parseSkillReferenceTag,
  parseSkillTag,
  SKILL_TAG_REGEX,
  serializeUnavailableSkillTag,
} from "@app/lib/skills/format";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { Err, Ok, type Result } from "@app/types/shared/result";

export type SkillInstructionsOverride = {
  instructionsOverride?: string;
};

const UNAVAILABLE_SKILL_TAG_REGEX =
  /<unavailable_skill\s+([^>]*?)\s*(?:\/>|><\/unavailable_skill>)/g;

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

function buildSkillReferenceTagById(
  content: string | null
): Map<string, string> {
  return new Map(
    [...(content ?? "").matchAll(SKILL_TAG_REGEX)].flatMap((match) => {
      const skill = parseSkillTag(match[0]);

      return skill ? [[skill.id, match[0]]] : [];
    })
  );
}

function restoreUnavailableSkillReferencesInContent({
  currentContent,
  updatedContent,
}: {
  currentContent: string | null;
  updatedContent: string;
}): Result<string, Error> {
  const skillReferenceTagById = buildSkillReferenceTagById(currentContent);
  let invalidUnavailableSkillId: string | null = null;

  const restoredContent = updatedContent.replace(
    UNAVAILABLE_SKILL_TAG_REGEX,
    (tag) => {
      const unavailableSkill = parseSkillReferenceTag(tag);
      const skillReferenceTag = unavailableSkill
        ? skillReferenceTagById.get(unavailableSkill.id)
        : undefined;

      if (!unavailableSkill || !skillReferenceTag) {
        invalidUnavailableSkillId = unavailableSkill?.id ?? "";
        return tag;
      }

      return skillReferenceTag;
    }
  );

  if (invalidUnavailableSkillId !== null) {
    return new Err(
      new Error(
        invalidUnavailableSkillId
          ? `Unavailable skill reference ${invalidUnavailableSkillId} does not match an existing skill reference.`
          : "Unavailable skill reference does not match an existing skill reference."
      )
    );
  }

  return new Ok(restoredContent);
}

export function restoreUnavailableSkillReferencesForPersistence({
  current,
  updated,
}: {
  current: {
    instructions: string;
    instructionsHtml: string | null;
  };
  updated: {
    instructions: string;
    instructionsHtml: string | null;
  };
}): Result<
  {
    instructions: string;
    instructionsHtml: string | null;
  },
  Error
> {
  const restoredInstructions = restoreUnavailableSkillReferencesInContent({
    currentContent: current.instructions,
    updatedContent: updated.instructions,
  });
  if (restoredInstructions.isErr()) {
    return restoredInstructions;
  }

  const restoredInstructionsHtml =
    updated.instructionsHtml !== null
      ? restoreUnavailableSkillReferencesInContent({
          currentContent: current.instructionsHtml,
          updatedContent: updated.instructionsHtml,
        })
      : new Ok(null);
  if (restoredInstructionsHtml.isErr()) {
    return restoredInstructionsHtml;
  }

  return new Ok({
    instructions: restoredInstructions.value,
    instructionsHtml: restoredInstructionsHtml.value,
  });
}
