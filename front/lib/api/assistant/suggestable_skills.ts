import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isSkillVisibleToViewer } from "@app/types/assistant/skill_configuration_constants";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:fabiencelier,label:security;product] suggestable-skills-match-builder
 * A skill that a suggestion adds to an agent MUST be one the agent builder offers the caller: an
 * active skill (custom or global) the caller can read, and, when it is unpublished (`editors`
 * availability), that the caller can edit. A `pending` skill is the only exception:
 * `suggest` only stores one when a skill creation of the same batch makes it active.
 */
export async function fetchSuggestableSkills(
  auth: Authenticator,
  skillIds: string[]
): Promise<Map<string, SkillResource>> {
  const skills = await SkillResource.fetchByIds(auth, skillIds, {
    onlyActive: true,
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  return new Map(
    skills
      .filter((skill) =>
        isSkillVisibleToViewer({
          availability: skill.availability,
          viewerCanWrite: auth.can("write", skill),
        })
      )
      .map((skill) => [skill.sId, skill])
  );
}

/** The skill a suggestion adds, among the `suggestable` ones (see `fetchSuggestableSkills`). */
export function checkSkillAddition(
  skillId: string,
  suggestable: Map<string, SkillResource>
): Result<SkillResource, string> {
  const skill = suggestable.get(skillId);
  if (!skill) {
    return new Err(
      `Skill "${skillId}" is invalid, archived or not accessible.`
    );
  }
  return new Ok(skill);
}
