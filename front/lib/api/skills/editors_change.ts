import { findSkillEditorsWithoutSpaceAccess } from "@app/lib/api/skills/space_requirements";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  parseSkillSuggestionData,
  SKILL_SUGGESTION_SOURCES,
} from "@app/types/suggestions/skill_suggestion";

export type SkillEditorsChangeErrorCode =
  | "not_authorized"
  | "archived"
  | "user_not_found"
  | "user_not_member"
  | "space_access_denied"
  | "last_editor_removed"
  | "apply_failed";

export class SkillEditorsChangeError extends Error {
  constructor(
    readonly code: SkillEditorsChangeErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface SkillEditorsChange {
  usersToAdd: UserResource[];
  usersToRemove: UserResource[];
}

/**
 * @cc [owner:achilleburah,label:security] editors-suggestion-requires-administrate
 * An editors change MUST only be validated for a caller who could perform the same change
 * manually: `skill.canAdministrate(auth)`, the exact check the `PATCH /skills/:sId/editors` route
 * uses. Otherwise it fails with `not_authorized`.
 */
/**
 * @cc [owner:achilleburah,label:product] editors-parity-with-manual-path
 * The change MUST be accepted exactly when the manual editors route would accept it, with one
 * deliberate exception: a change leaving the skill with zero editors fails with
 * `last_editor_removed`. The manual route permits it; a suggestion does not, because it is
 * reviewed as a batch where one bad removal would orphan a skill nobody can then repair.
 */
/**
 * @cc [owner:achilleburah,label:security] editors-change-validated-against-live-state
 * Every rule reads live state at call time (permissions, archived status, target users' active
 * membership, added editors' access to the skill's requested spaces, current editor set). Callers
 * MUST re-run it before applying a previously recorded change; nothing validated earlier may be
 * trusted.
 */
export async function validateSkillEditorsChange(
  auth: Authenticator,
  skill: SkillResource,
  {
    addUserIds,
    removeUserIds,
  }: { addUserIds: string[]; removeUserIds: string[] }
): Promise<Result<SkillEditorsChange, SkillEditorsChangeError>> {
  if (!skill.canAdministrate(auth)) {
    return new Err(
      new SkillEditorsChangeError(
        "not_authorized",
        "Only editors of this skill or workspace admins can change its editors."
      )
    );
  }

  if (skill.status === "archived") {
    return new Err(
      new SkillEditorsChangeError(
        "archived",
        "This skill is archived; its editors cannot be changed."
      )
    );
  }

  const [usersToAdd, usersToRemove] = await Promise.all([
    UserResource.fetchByIds(addUserIds),
    UserResource.fetchByIds(removeUserIds),
  ]);
  const foundIds = new Set([...usersToAdd, ...usersToRemove].map((u) => u.sId));
  const missingIds = [...addUserIds, ...removeUserIds].filter(
    (id) => !foundIds.has(id)
  );
  if (missingIds.length > 0) {
    return new Err(
      new SkillEditorsChangeError(
        "user_not_found",
        `Some users were not found: ${missingIds.join(", ")}.`
      )
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  const targets = [...usersToAdd, ...usersToRemove];
  const { memberships } = await MembershipResource.getActiveMemberships({
    users: targets,
    workspace,
  });
  const memberUserIds = new Set(memberships.map((m) => m.userId));
  const nonMembers = targets.filter((u) => !memberUserIds.has(u.id));
  if (nonMembers.length > 0) {
    return new Err(
      new SkillEditorsChangeError(
        "user_not_member",
        `Some users are not active members of this workspace: ${nonMembers
          .map((u) => u.sId)
          .join(", ")}.`
      )
    );
  }

  // Only the editors being added need checking, as on the manual route.
  const requestedSpaces = await SpaceResource.fetchByModelIds(auth, [
    ...skill.requestedSpaceIds,
  ]);
  const spaceAccessError = await findSkillEditorsWithoutSpaceAccess(auth, {
    editors: usersToAdd,
    requestedSpaces,
  });
  if (spaceAccessError) {
    return new Err(
      new SkillEditorsChangeError("space_access_denied", spaceAccessError)
    );
  }

  const currentEditors = (await skill.listEditors(auth)) ?? [];
  const removedIds = new Set(usersToRemove.map((u) => u.id));
  const remaining = new Set(
    [...currentEditors, ...usersToAdd]
      .map((u) => u.id)
      .filter((id) => !removedIds.has(id))
  );
  if (remaining.size === 0) {
    return new Err(
      new SkillEditorsChangeError(
        "last_editor_removed",
        "This change would leave the skill without any editor. Keep or add at least one editor."
      )
    );
  }

  return new Ok({ usersToAdd, usersToRemove });
}

/**
 * @cc [owner:achilleburah,label:security] editors-revalidated-at-accept
 * Approving an editors suggestion MUST re-run `validateSkillEditorsChange` against live state
 * before writing anything: the caller's authorization, archived status, the target users' active
 * workspace membership, the added editors' access to the skill's requested spaces (which may have
 * moved since creation) and the last-editor rule. Nothing validated at creation time is trusted.
 */
/**
 * @cc [owner:achilleburah,label:product] one-applied-editors-suggestion
 * Once the change is applied, every other `pending` editors suggestion for the same skill MUST be
 * marked `outdated`, whatever its source. Pending editors suggestions are not capped.
 */
export async function applySkillEditorsSuggestion(
  auth: Authenticator,
  skill: SkillResource,
  suggestion: SkillSuggestionResource
): Promise<Result<undefined, SkillEditorsChangeError>> {
  const data = parseSkillSuggestionData(suggestion);
  if (data.kind !== "editors") {
    return new Err(
      new SkillEditorsChangeError(
        "apply_failed",
        "Only editors suggestions can be applied this way."
      )
    );
  }

  const validation = await validateSkillEditorsChange(
    auth,
    skill,
    data.suggestion
  );
  if (validation.isErr()) {
    return validation;
  }
  const { usersToAdd, usersToRemove } = validation.value;

  // Same order as the manual route: adds first, then removals.
  const addRes = await skill.addEditors(auth, usersToAdd);
  if (addRes.isErr()) {
    return new Err(applyFailed(addRes.error));
  }
  const removeRes = await skill.removeEditors(auth, usersToRemove);
  if (removeRes.isErr()) {
    return new Err(applyFailed(removeRes.error));
  }

  const pending = await SkillSuggestionResource.listBySkillConfigurationId(
    auth,
    skill.sId,
    {
      states: ["pending"],
      kind: "editors",
      sources: [...SKILL_SUGGESTION_SOURCES],
    }
  );
  await SkillSuggestionResource.bulkUpdateState(
    auth,
    pending.filter((s) => s.sId !== suggestion.sId),
    "outdated"
  );

  return new Ok(undefined);
}

// `writeEditorUserGrants` folds every grant failure into `user_not_found`, so the code carries no
// information here: surface a generic apply failure with the underlying message.
function applyFailed(error: Error): SkillEditorsChangeError {
  return new SkillEditorsChangeError(
    "apply_failed",
    `Failed to apply the editors change: ${error.message}`
  );
}
