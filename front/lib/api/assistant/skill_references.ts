import {
  getUnavailableSkillReferenceIds,
  replaceUnavailableSkillReferences,
  type SkillInstructionsOverride,
} from "@app/lib/api/skills/skill_references";
import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

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
  return concurrentExecutor(
    skills,
    async (skill) => {
      const unavailableSkillIds = await getUnavailableSkillReferenceIds(auth, [
        skill.instructions,
        skill.extendedSkill?.instructions,
      ]);

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
    },
    { concurrency: 5 }
  );
}

export async function resolveSkillReferencesForAgentLoop(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<(SkillResource & SkillInstructionsOverride)[]> {
  return concurrentExecutor(
    skills,
    async (skill) => {
      const unavailableSkillIds = await getUnavailableSkillReferenceIds(auth, [
        skill.instructions,
      ]);

      return withInstructionsOverride(
        skill,
        replaceUnavailableSkillReferences(
          skill.instructions,
          unavailableSkillIds
        )
      );
    },
    { concurrency: 5 }
  );
}
