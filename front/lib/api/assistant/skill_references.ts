import type { Authenticator } from "@app/lib/auth";
import {
  type SkillInstructionsOverride,
  SkillResource,
} from "@app/lib/resources/skill/skill_resource";

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

async function getSkillReferenceInstructionsBySkill(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<Map<SkillResource, string>> {
  const replacements = await SkillResource.replaceUnavailableSkillReferences(
    auth,
    skills
  );

  return new Map(
    skills.map((skill, index) => [
      skill,
      replacements[index]?.instructions ?? skill.instructions,
    ])
  );
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
  const instructionsBySkill = await getSkillReferenceInstructionsBySkill(
    auth,
    skills.flatMap((skill) =>
      skill.extendedSkill ? [skill, skill.extendedSkill] : [skill]
    )
  );

  return skills.map((skill) => {
    const instructions = instructionsBySkill.get(skill) ?? skill.instructions;
    const extendedSkill = skill.extendedSkill
      ? withInstructionsOverride(
          skill.extendedSkill,
          instructionsBySkill.get(skill.extendedSkill) ??
            skill.extendedSkill.instructions
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
  const instructionsBySkill = await getSkillReferenceInstructionsBySkill(
    auth,
    skills
  );

  return skills.map((skill) =>
    withInstructionsOverride(
      skill,
      instructionsBySkill.get(skill) ?? skill.instructions
    )
  );
}
