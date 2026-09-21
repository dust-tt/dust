import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type SkillWriteAccessErrorCode =
  | "not_custom_skill"
  | "skill_not_found"
  | "not_authorized"
  | "archived";

export class SkillWriteAccessError extends Error {
  constructor(
    readonly code: SkillWriteAccessErrorCode,
    message: string
  ) {
    super(message);
  }
}

/**
 * @cc [owner:avervaet,label:security] requires-skill-write
 * A caller MUST only be handed back a custom skill it can write and that is not archived;
 * otherwise the call fails with a `SkillWriteAccessError` and the skill is not returned.
 */
export async function fetchWritableSkill(
  auth: Authenticator,
  skillId: string
): Promise<Result<SkillResource, SkillWriteAccessError>> {
  if (!isResourceSId("skill", skillId)) {
    return new Err(
      new SkillWriteAccessError(
        "not_custom_skill",
        "Only custom workspace skills can receive suggestions."
      )
    );
  }

  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    return new Err(
      new SkillWriteAccessError("skill_not_found", "Skill not found.")
    );
  }

  if (!skill.canWrite(auth)) {
    return new Err(
      new SkillWriteAccessError(
        "not_authorized",
        "You need to be added as an editor of this skill before you can suggest changes."
      )
    );
  }

  if (skill.status === "archived") {
    return new Err(
      new SkillWriteAccessError(
        "archived",
        "This skill is archived and cannot receive suggestions."
      )
    );
  }

  return new Ok(skill);
}
