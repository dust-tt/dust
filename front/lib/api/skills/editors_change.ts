import { findSkillEditorsWithoutSpaceAccess } from "@app/lib/api/skills/space_requirements";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type SkillEditorsChangeErrorCode =
  | "not_authorized"
  | "archived"
  | "user_not_found"
  | "user_in_both_lists"
  | "user_not_member"
  | "space_access_denied"
  | "last_editor_removed";

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
 * @cc [owner:achilleburah,label:security;product] same-rules-as-manual-editors-route
 * A change MUST pass exactly when `PATCH /skills/:sId/editors` would accept it from the same
 * caller: `auth.can("admin", skill)`, skill not archived, every user found, added editors
 * active members able to read the skill's requested spaces. Removed users need no membership:
 * the route lets a departed member be removed, and so does this. Two deliberate additions the
 * route permits: a user in both lists fails with `user_in_both_lists`, as the recorded change
 * would be ambiguous to apply; a change leaving the skill with zero editors fails with
 * `last_editor_removed`, as one bad removal in a reviewed batch would orphan a skill.
 */
/**
 * @cc [owner:achilleburah,label:security] editors-change-validated-against-live-state
 * Users, memberships, spaces and the current editor set are read at call time; permissions and
 * archived status come from the `auth` and `skill` passed in. Callers MUST pass a freshly fetched
 * skill and authenticator and re-run this before applying a previously recorded change; nothing
 * validated earlier may be trusted.
 */
export async function validateSkillEditorsChange(
  auth: Authenticator,
  skill: SkillResource,
  {
    addUserIds,
    removeUserIds,
  }: { addUserIds: string[]; removeUserIds: string[] }
): Promise<Result<SkillEditorsChange, SkillEditorsChangeError>> {
  if (!auth.can("admin", skill)) {
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

  const removeUserIdSet = new Set(removeUserIds);
  const inBothLists = [
    ...new Set(addUserIds.filter((id) => removeUserIdSet.has(id))),
  ];
  if (inBothLists.length > 0) {
    return new Err(
      new SkillEditorsChangeError(
        "user_in_both_lists",
        `Some users are both added and removed: ${inBothLists.join(", ")}.`
      )
    );
  }

  const { missingIds, usersToAdd, usersToRemove } =
    await resolveSkillEditorUsers({
      addUserIds,
      removeUserIds,
    });
  if (missingIds.length > 0) {
    return new Err(
      new SkillEditorsChangeError(
        "user_not_found",
        `Some users were not found: ${missingIds.join(", ")}.`
      )
    );
  }

  // Only added editors must be active members; removing a departed member is a valid cleanup.
  const nonMembers = await listNonMembers(auth, usersToAdd);
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

  const spaceAccessError = await findAddedEditorsWithoutSpaceAccess(
    auth,
    skill,
    usersToAdd
  );
  if (spaceAccessError) {
    return new Err(
      new SkillEditorsChangeError("space_access_denied", spaceAccessError)
    );
  }

  const remainingEditors = await listRemainingEditors(auth, skill, {
    usersToAdd,
    usersToRemove,
  });
  if (remainingEditors.length === 0) {
    return new Err(
      new SkillEditorsChangeError(
        "last_editor_removed",
        "This change would leave the skill without any editor. Keep or add at least one editor."
      )
    );
  }

  return new Ok({ usersToAdd, usersToRemove });
}

export async function resolveSkillEditorUsers({
  addUserIds,
  removeUserIds,
}: {
  addUserIds: string[];
  removeUserIds: string[];
}): Promise<SkillEditorsChange & { missingIds: string[] }> {
  const userIds = [...new Set([...addUserIds, ...removeUserIds])];
  const users = await UserResource.fetchByIds(userIds);
  const found = new Set(users.map((u) => u.sId));
  const addUserIdSet = new Set(addUserIds);
  const removeUserIdSet = new Set(removeUserIds);

  return {
    missingIds: userIds.filter((id) => !found.has(id)),
    usersToAdd: users.filter((u) => addUserIdSet.has(u.sId)),
    usersToRemove: users.filter((u) => removeUserIdSet.has(u.sId)),
  };
}

async function listNonMembers(
  auth: Authenticator,
  users: UserResource[]
): Promise<UserResource[]> {
  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace: auth.getNonNullableWorkspace(),
  });
  const memberUserModelIds = new Set(memberships.map((m) => m.userId));

  return users.filter((u) => !memberUserModelIds.has(u.id));
}

// Only the editors being added need checking: the ones already there were validated when they were
// added or when the skill's spaces last changed.
export async function findAddedEditorsWithoutSpaceAccess(
  auth: Authenticator,
  skill: SkillResource,
  usersToAdd: UserResource[]
): Promise<string | null> {
  const requestedSpaces = await SpaceResource.fetchByModelIds(auth, [
    ...skill.requestedSpaceIds,
  ]);

  return findSkillEditorsWithoutSpaceAccess(auth, {
    editors: usersToAdd,
    requestedSpaces,
  });
}

// The editor set once the change is applied: current editors plus additions, minus removals.
async function listRemainingEditors(
  auth: Authenticator,
  skill: SkillResource,
  { usersToAdd, usersToRemove }: SkillEditorsChange
): Promise<UserResource[]> {
  const currentEditors = (await skill.listEditors(auth)) ?? [];
  const removedUserModelIds = new Set(usersToRemove.map((u) => u.id));

  return [...currentEditors, ...usersToAdd].filter(
    (u) => !removedUserModelIds.has(u.id)
  );
}
