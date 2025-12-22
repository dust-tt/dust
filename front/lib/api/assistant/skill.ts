import uniq from "lodash/uniq";

import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { removeNulls } from "@app/types";

/**
 * Augment skills with their extended skill data.
 * For each skill that has an extendedSkillId, fetches the extended skill
 * and attaches it to the skill object.
 */
export async function augmentSkillsWithExtendedSkills(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<(SkillResource & { extendedSkill: SkillResource | null })[]> {
  const extendedSkillIds = removeNulls(
    uniq(skills.map((skill) => skill.extendedSkillId))
  );
  const extendedSkills = await SkillResource.fetchByIds(auth, extendedSkillIds);

  // Create a map for quick lookup of extended skills.
  const extendedSkillsMap = new Map(
    extendedSkills.map((skill) => [skill.sId, skill])
  );

  return skills.map((skill) =>
    Object.assign(skill, {
      extendedSkill: skill.extendedSkillId
        ? (extendedSkillsMap.get(skill.extendedSkillId) ?? null)
        : null,
    })
  );
}
