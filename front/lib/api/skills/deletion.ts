import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type SkillDeletionErrorCode = "not_authorized" | "archived";

export class SkillDeletionError extends Error {
  constructor(
    readonly code: SkillDeletionErrorCode,
    message: string
  ) {
    super(message);
  }
}

/**
 * @cc [owner:avervaet,label:security;product] same-rules-as-manual-archive-route
 * A deletion MUST pass exactly when `POST /skills/archive` would accept it from the same caller:
 * `skill.canAdministrate(auth)` and the skill not already archived. Callers MUST pass a freshly
 * fetched skill and authenticator and re-run this before archiving a previously recorded
 * suggestion; nothing validated earlier may be trusted.
 */
export function validateSkillDeletion(
  auth: Authenticator,
  skill: SkillResource
): Result<undefined, SkillDeletionError> {
  if (!skill.canAdministrate(auth)) {
    return new Err(
      new SkillDeletionError(
        "not_authorized",
        "Only editors of this skill or workspace admins can delete it."
      )
    );
  }

  if (skill.status !== "active") {
    return new Err(
      new SkillDeletionError("archived", "Only active skills can be deleted.")
    );
  }

  return new Ok(undefined);
}
