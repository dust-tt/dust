import {
  getUnavailableSkillReferenceIdsByParent,
  replaceUnavailableSkillReferenceTags,
  type SkillInstructionsOverride,
} from "@app/lib/api/skills/skill_references";
import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";

const EMPTY_UNAVAILABLE_SKILL_IDS = new Set<string>();

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

async function getUnavailableSkillReferenceIdsBySkill(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<Map<SkillResource, ReadonlySet<string>>> {
  const unavailableSkillIdsByParent =
    await getUnavailableSkillReferenceIdsByParent(
      auth,
      skills.map((skill) => ({
        contents: [skill.instructions],
        requestedSpaceIds: skill.requestedSpaceIds,
      }))
    );

  return new Map(
    skills.map((skill, index) => [
      skill,
      unavailableSkillIdsByParent[index] ?? EMPTY_UNAVAILABLE_SKILL_IDS,
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
  const unavailableSkillIdsBySkill =
    await getUnavailableSkillReferenceIdsBySkill(
      auth,
      skills.flatMap((skill) =>
        skill.extendedSkill ? [skill, skill.extendedSkill] : [skill]
      )
    );

  return skills.map((skill) => {
    const unavailableSkillIds =
      unavailableSkillIdsBySkill.get(skill) ?? EMPTY_UNAVAILABLE_SKILL_IDS;
    const instructions = replaceUnavailableSkillReferenceTags(
      skill.instructions,
      unavailableSkillIds
    );
    const extendedSkillUnavailableSkillIds = skill.extendedSkill
      ? (unavailableSkillIdsBySkill.get(skill.extendedSkill) ??
        EMPTY_UNAVAILABLE_SKILL_IDS)
      : EMPTY_UNAVAILABLE_SKILL_IDS;
    const extendedSkill = skill.extendedSkill
      ? withInstructionsOverride(
          skill.extendedSkill,
          replaceUnavailableSkillReferenceTags(
            skill.extendedSkill.instructions,
            extendedSkillUnavailableSkillIds
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
  const unavailableSkillIdsBySkill =
    await getUnavailableSkillReferenceIdsBySkill(auth, skills);

  return skills.map((skill) =>
    withInstructionsOverride(
      skill,
      replaceUnavailableSkillReferenceTags(
        skill.instructions,
        unavailableSkillIdsBySkill.get(skill) ?? EMPTY_UNAVAILABLE_SKILL_IDS
      )
    )
  );
}
