import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type SkillAvailabilityChangeErrorCode =
  | "not_authorized"
  | "archived"
  | "publish_denied"
  | "make_discoverable_denied";

export class SkillAvailabilityChangeError extends Error {
  constructor(
    readonly code: SkillAvailabilityChangeErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface SkillAvailabilityChange {
  availability: SkillAvailability;
}

/**
 * @cc [owner:achilleburah,label:security;product] same-rules-as-manual-availability-change
 * A change MUST pass exactly when `PATCH /skills/availability` would accept it from the same
 * caller: `auth.can("admin", skill)` (editors of this skill or workspace admins, matching
 * `validateSkillDeletion`), skill not archived, then, only when the requested value differs from
 * the current one, `hasWorkspacePermission("publish", "skill")` and, when either side is
 * `users_and_agents`, `hasWorkspacePermission("make_discoverable", "skill")`
 * (`skill-publish-capability`, `skill-make-discoverable-capability`). A requested value equal to
 * the current one returns `Ok(null)`: nothing to write and no capability consulted. Every check
 * reads the `auth` and `skill` passed in, so callers MUST pass a freshly fetched skill and
 * authenticator and re-run this before applying a previously recorded change.
 */
export function validateSkillAvailabilityChange(
  auth: Authenticator,
  skill: SkillResource,
  { availability }: { availability: SkillAvailability }
): Result<SkillAvailabilityChange | null, SkillAvailabilityChangeError> {
  if (!auth.can("admin", skill)) {
    return new Err(
      new SkillAvailabilityChangeError(
        "not_authorized",
        "Only editors of this skill or workspace admins can change its availability."
      )
    );
  }

  if (skill.status === "archived") {
    return new Err(
      new SkillAvailabilityChangeError(
        "archived",
        "This skill is archived; its availability cannot be changed."
      )
    );
  }

  if (availability === skill.availability) {
    return new Ok(null);
  }

  if (!auth.hasWorkspacePermission("publish", "skill")) {
    return new Err(
      new SkillAvailabilityChangeError(
        "publish_denied",
        "You don't have permission to change this skill's availability."
      )
    );
  }

  const involvesAutoDiscoverable =
    availability === "users_and_agents" ||
    skill.availability === "users_and_agents";
  if (
    involvesAutoDiscoverable &&
    !auth.hasWorkspacePermission("make_discoverable", "skill")
  ) {
    return new Err(
      new SkillAvailabilityChangeError(
        "make_discoverable_denied",
        "You don't have permission to change this skill's auto-discoverable status."
      )
    );
  }

  return new Ok({ availability });
}
