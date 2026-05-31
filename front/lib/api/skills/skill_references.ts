import {
  parseSkillReferenceTag,
  parseSkillTag,
  SKILL_TAG_REGEX,
} from "@app/lib/skills/format";
import { Err, Ok, type Result } from "@app/types/shared/result";

const UNAVAILABLE_SKILL_TAG_REGEX =
  /<unavailable_skill\s+([^>]*?)\s*(?:\/>|><\/unavailable_skill>)/g;

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
