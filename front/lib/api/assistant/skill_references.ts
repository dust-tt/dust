import {
  getUnavailableSkillReferenceIds,
  replaceUnavailableSkillReferences,
  type SkillInstructionsOverride,
} from "@app/lib/api/skills/skill_references";
import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";

function withInstructionsOverride(
  skill: SkillResource,
  instructions: string
): SkillResource & SkillInstructionsOverride {
  if (instructions === skill.instructions) {
    return skill;
  }

  return Object.assign(Object.create(skill), {
    instructionsOverride: instructions,
  });
}

export async function resolveEnabledSkillReferencesForAgentLoop<
  T extends SkillResource & { extendedSkill: SkillResource | null },
>(
  auth: Authenticator,
  skills: T[]
): Promise<
  (SkillResource &
    SkillInstructionsOverride & {
      extendedSkill: (SkillResource & SkillInstructionsOverride) | null;
    })[]
> {
  const unavailableSkillIds = await getUnavailableSkillReferenceIds(
    auth,
    skills.flatMap((skill) => [
      skill.instructions,
      skill.extendedSkill?.instructions,
    ])
  );

  return skills.map((skill) => {
    const instructions = replaceUnavailableSkillReferences(
      skill.instructions,
      unavailableSkillIds
    );
    const extendedSkill = skill.extendedSkill
      ? withInstructionsOverride(
          skill.extendedSkill,
          replaceUnavailableSkillReferences(
            skill.extendedSkill.instructions,
            unavailableSkillIds
          )
        )
      : null;

    return Object.assign(Object.create(skill), {
      extendedSkill,
      ...(instructions === skill.instructions
        ? {}
        : { instructionsOverride: instructions }),
    });
  });
}

export async function resolveSkillReferencesForAgentLoop(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<(SkillResource & SkillInstructionsOverride)[]> {
  const unavailableSkillIds = await getUnavailableSkillReferenceIds(
    auth,
    skills.map((skill) => skill.instructions)
  );

  return skills.map((skill) =>
    withInstructionsOverride(
      skill,
      replaceUnavailableSkillReferences(skill.instructions, unavailableSkillIds)
    )
  );
}
