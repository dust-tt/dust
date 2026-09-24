import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type SkillLookupErrorCode = "not_custom_skill" | "skill_not_found";

export class SkillLookupError extends Error {
  constructor(
    readonly code: SkillLookupErrorCode,
    message: string
  ) {
    super(message);
  }
}

/**
 * @cc [owner:achilleburah,label:coding] shared-skill-id-resolution
 * Resolves a skill id the way every skill tool MUST: reject a non-custom skill id, then a skill
 * the caller cannot read, before any check that depends on the resolved `SkillResource`. The
 * fetch MUST use strict permission filtering; it MUST NOT be weakened to return a skill the
 * caller cannot access.
 */
export async function fetchCustomSkillById(
  auth: Authenticator,
  skillId: string,
  notCustomSkillMessage = "Only custom workspace skills are supported."
): Promise<Result<SkillResource, SkillLookupError>> {
  if (!isResourceSId("skill", skillId)) {
    return new Err(
      new SkillLookupError("not_custom_skill", notCustomSkillMessage)
    );
  }

  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    return new Err(new SkillLookupError("skill_not_found", "Skill not found."));
  }

  return new Ok(skill);
}

export type SkillWriteAccessErrorCode =
  | SkillLookupErrorCode
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
  const skillResult = await fetchCustomSkillById(
    auth,
    skillId,
    "Only custom workspace skills can receive suggestions."
  );
  if (skillResult.isErr()) {
    return new Err(
      new SkillWriteAccessError(
        skillResult.error.code,
        skillResult.error.message
      )
    );
  }

  return checkSkillWritable(auth, skillResult.value);
}

/**
 * The write checks of `fetchWritableSkill` for a skill that is already resolved: the caller can
 * write it and it is not archived.
 */
export function checkSkillWritable(
  auth: Authenticator,
  skill: SkillResource
): Result<SkillResource, SkillWriteAccessError> {
  if (!auth.can("write", skill)) {
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
