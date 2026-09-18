import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillReinforcementMode } from "@app/types/assistant/skill_configuration_constants";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type SkillReinforcementChangeErrorCode =
  | "not_authorized"
  | "archived"
  | "locked";

export class SkillReinforcementChangeError extends Error {
  constructor(
    readonly code: SkillReinforcementChangeErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface SkillReinforcementChange {
  reinforcement: SkillReinforcementMode;
}

/**
 * @cc [owner:achilleburah,label:security;product] same-rules-as-manual-reinforcement-route
 * A change MUST pass exactly when `PATCH /skills/:sId/reinforcement` would accept the mode from
 * the same caller: `skill.canAdministrate(auth)`, skill not archived, and, when
 * `skill.selfImprovementLock` is set, `auth.isAdmin()`. It does not check `canWrite`: a workspace
 * admin who is not an editor may change the mode, as the route lets them.
 */
/**
 * @cc [owner:achilleburah,label:security] reinforcement-change-validated-against-live-state
 * Permissions, archived status and the lock come from the `auth` and `skill` passed in. Callers
 * MUST pass a freshly fetched skill and authenticator and re-run this before applying a previously
 * recorded change; nothing validated earlier may be trusted.
 */
export async function validateSkillReinforcementChange(
  auth: Authenticator,
  skill: SkillResource,
  { reinforcement }: { reinforcement: SkillReinforcementMode }
): Promise<Result<SkillReinforcementChange, SkillReinforcementChangeError>> {
  if (!skill.canAdministrate(auth)) {
    return new Err(
      new SkillReinforcementChangeError(
        "not_authorized",
        "Only admins and editors can modify this skill."
      )
    );
  }

  if (skill.status === "archived") {
    return new Err(
      new SkillReinforcementChangeError(
        "archived",
        "An archived skill cannot be updated. Restore it first."
      )
    );
  }

  if (skill.selfImprovementLock && !auth.isAdmin()) {
    return new Err(
      new SkillReinforcementChangeError(
        "locked",
        "This skill's self-improvement is locked; only admins can change it."
      )
    );
  }

  return new Ok({ reinforcement });
}
