import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";

function withReplacedInstructions(
  skill: SkillResource,
  instructions: string
): SkillResource {
  return Object.assign(Object.create(skill), {
    instructions,
  });
}

async function getReplacedInstructionsBySkill(
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
  (SkillResource & {
    extendedSkill: SkillResource | null;
  })[]
> {
  const instructionsBySkill = await getReplacedInstructionsBySkill(
    auth,
    skills.flatMap((skill) =>
      skill.extendedSkill ? [skill, skill.extendedSkill] : [skill]
    )
  );

  return skills.map((skill) => {
    const instructions = instructionsBySkill.get(skill) ?? skill.instructions;
    const extendedSkill = skill.extendedSkill
      ? withReplacedInstructions(
          skill.extendedSkill,
          instructionsBySkill.get(skill.extendedSkill) ??
            skill.extendedSkill.instructions
        )
      : null;

    return Object.assign(Object.create(skill), {
      extendedSkill,
      instructions,
    });
  });
}

export async function resolveSkillReferencesForAgentLoop(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<SkillResource[]> {
  const instructionsBySkill = await getReplacedInstructionsBySkill(
    auth,
    skills
  );

  return skills.map((skill) =>
    withReplacedInstructions(
      skill,
      instructionsBySkill.get(skill) ?? skill.instructions
    )
  );
}
