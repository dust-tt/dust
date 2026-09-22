import {
  filterUsersWithSharedMembership,
  hasSharedMembership,
} from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { grantKey } from "@app/types/group_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import type { Transaction } from "sequelize";

// The grant a skill's editors hold on the skill. Its verbs live in ROLE_REGISTRY.skill.
export const SKILL_EDITOR_GRANT_TYPE = "editor" as const;
/**
 * Grants the creating user the skill's `editor` grant, which `grantToUser` holds in one
 * regular_auto group per skill. Skills do not carry an editor group of their own: editorship
 * lives entirely in `group_permissions`.
 */
export async function grantCreatorAsEditor(
  auth: Authenticator,
  skill: SkillConfigurationModel,
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  assert(
    skill.workspaceId === workspace.id,
    "Unexpected: skill and workspace mismatch"
  );

  const grantResult = await GroupPermissionResource.grantToUser(auth, {
    user: auth.getNonNullableUser().toJSON(),
    grantType: SKILL_EDITOR_GRANT_TYPE,
    resourceType: "skill",
    resourceId: skill.id,
    transaction,
  });
  // This grant is the only thing making the creator an editor of their own skill: without it the
  // skill is created with no editor and nobody but a workspace admin can fix it. Throwing rolls
  // the creation transaction back.
  if (grantResult.isErr()) {
    throw new Error(
      `Failed to grant the skill creator their editor grant: ${grantResult.error.message}`
    );
  }
}

export async function listEditors(
  skillResource: SkillResource,
  auth: Authenticator
): Promise<UserResource[] | null> {
  // Code-defined global/system skills have no editors at all.
  if (skillResource.kind !== "custom") {
    return null;
  }

  const grantGroup = await GroupPermissionResource.findRegularAutoGroupForGrant(
    auth,
    {
      grantType: SKILL_EDITOR_GRANT_TYPE,
      resourceType: "skill",
      resourceId: skillResource.id,
    }
  );

  return grantGroup ? grantGroup.getActiveMembers(auth) : [];
}

export async function upsertEditors(
  skillResource: SkillResource,
  auth: Authenticator,
  users: UserResource[]
): Promise<Result<void, Error>> {
  if (users.length === 0) {
    return new Ok(undefined);
  }

  if (!skillResource.canAdministrate(auth)) {
    return new Err(
      new Error("User is not authorized to update skill editors.")
    );
  }

  const existingEditors = await skillResource.listEditors(auth);
  const existingEditorIds = new Set(existingEditors?.map((u) => u.id) ?? []);
  const usersToAdd = users.filter((u) => !existingEditorIds.has(u.id));

  if (usersToAdd.length === 0) {
    return new Ok(undefined);
  }

  const addResult = await skillResource.addEditors(auth, usersToAdd);
  if (addResult.isErr()) {
    return new Err(new Error(addResult.error.message));
  }

  return new Ok(undefined);
}

export async function addEditors(
  resourceClass: typeof SkillResource,
  skillResource: SkillResource,
  auth: Authenticator,
  users: UserResource[]
): Promise<Result<undefined, DustError<"unauthorized" | "user_not_found">>> {
  if (users.length === 0) {
    return new Ok(undefined);
  }

  if (!skillResource.canAdministrate(auth)) {
    return new Err(
      new DustError(
        "unauthorized",
        "User is not authorized to update skill editors."
      )
    );
  }

  const result = await writeEditorUserGrants(
    skillResource,
    auth,
    users,
    "grant"
  );
  // Earlier editor updates may have succeeded even if a later one failed.
  await resourceClass.launchSearchIndexation(auth, [skillResource.sId]);
  return result;
}

export async function removeEditors(
  resourceClass: typeof SkillResource,
  skillResource: SkillResource,
  auth: Authenticator,
  users: UserResource[]
): Promise<Result<undefined, DustError<"unauthorized" | "user_not_found">>> {
  if (users.length === 0) {
    return new Ok(undefined);
  }

  if (!skillResource.canAdministrate(auth)) {
    return new Err(
      new DustError(
        "unauthorized",
        "User is not authorized to update skill editors."
      )
    );
  }

  const result = await writeEditorUserGrants(
    skillResource,
    auth,
    users,
    "revoke"
  );
  // Earlier editor updates may have succeeded even if a later one failed.
  await resourceClass.launchSearchIndexation(auth, [skillResource.sId]);
  return result;
}

// Editors are per-user grants: `grantToUser` holds them in one regular_auto group per skill, and
// `revokeFromUser` deletes that group once its last member leaves.
async function writeEditorUserGrants(
  skillResource: SkillResource,
  auth: Authenticator,
  users: UserResource[],
  operation: "grant" | "revoke"
): Promise<Result<undefined, DustError<"unauthorized" | "user_not_found">>> {
  for (const user of users) {
    const spec = {
      user: user.toJSON(),
      grantType: SKILL_EDITOR_GRANT_TYPE,
      resourceType: "skill" as const,
      resourceId: skillResource.id,
    };

    const result =
      operation === "grant"
        ? await GroupPermissionResource.grantToUser(auth, spec)
        : await GroupPermissionResource.revokeFromUser(auth, spec);

    if (result.isErr()) {
      return new Err(new DustError("user_not_found", result.error.message));
    }
  }

  return new Ok(undefined);
}

export async function fetchEditedByUser(
  skillResource: SkillResource,
  auth: Authenticator
): Promise<UserResource | null> {
  if (skillResource.editedBy === null) {
    return null;
  }

  const editedByUser = await UserResource.fetchByModelId(
    skillResource.editedBy
  );

  if (!editedByUser) {
    return null;
  }

  const shouldReturnEditedByUser = await hasSharedMembership(auth, {
    user: editedByUser,
  });

  return shouldReturnEditedByUser ? editedByUser : null;
}

export async function batchListEditors(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<Map<string, UserResource[] | null>> {
  const result = new Map<string, UserResource[] | null>(
    skills.map((s) => [s.sId, null])
  );

  // Code-defined global/system skills have no editors — see `listEditors`.
  const customSkills = skills.filter((s) => s.kind === "custom");

  if (customSkills.length === 0) {
    return result;
  }

  // Editors come from the per-user grants: one regular_auto group per skill — see `listEditors`.
  const editorGrantSpec = (skill: SkillResource) => ({
    grantType: SKILL_EDITOR_GRANT_TYPE,
    resourceType: "skill" as const,
    resourceId: skill.id,
  });

  const groupByGrant =
    await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
      grants: customSkills.map(editorGrantSpec),
    });

  const groupBySkillModelId = new Map<ModelId, GroupResource>(
    removeNulls(
      customSkills.map((skill) => {
        const group = groupByGrant.get(grantKey(editorGrantSpec(skill)));

        return group ? ([skill.id, group] as const) : null;
      })
    )
  );

  const membershipsByGroupId =
    await GroupResource.getActiveMembershipsForGroups(auth, [
      ...groupBySkillModelId.values(),
    ]);

  const allUserIds = [...new Set(Object.values(membershipsByGroupId).flat())];

  if (allUserIds.length === 0) {
    return result;
  }

  const allUsers = await UserResource.fetchByModelIds(allUserIds);

  // Filter to only keep users with an active workspace membership,
  // matching the behavior of getActiveMembers.
  const workspace = auth.getNonNullableWorkspace();
  const { memberships: workspaceMemberships } =
    await MembershipResource.getActiveMemberships({
      users: allUsers,
      workspace,
    });
  const activeWorkspaceUserIds = new Set(
    workspaceMemberships.map((m) => m.userId)
  );

  const userById = new Map(
    allUsers
      .filter((u) => activeWorkspaceUserIds.has(u.id))
      .map((u) => [u.id, u])
  );

  for (const skill of customSkills) {
    const group = groupBySkillModelId.get(skill.id);
    const userIds = group ? (membershipsByGroupId[group.id] ?? []) : [];
    const users = removeNulls(userIds.map((id) => userById.get(id) ?? null));
    result.set(skill.sId, users);
  }

  return result;
}

export async function batchFetchEditedByUsers(
  auth: Authenticator,
  skills: SkillResource[]
): Promise<Map<string, UserResource | null>> {
  const result = new Map<string, UserResource | null>(
    skills.map((s) => [s.sId, null])
  );

  const uniqueEditedByIds = [
    ...new Set(removeNulls(skills.map((s) => s.editedBy))),
  ];

  if (uniqueEditedByIds.length === 0) {
    return result;
  }

  // Single query: fetch all edited-by users.
  const editedByUsers = await UserResource.fetchByModelIds(uniqueEditedByIds);

  // Batch privacy filter: keep only users visible to the auth user.
  const visibleUsers = await filterUsersWithSharedMembership(
    auth,
    editedByUsers
  );
  const visibleUserIds = new Set(visibleUsers.map((u) => u.id));
  const userById = new Map(visibleUsers.map((u) => [u.id, u]));

  for (const skill of skills) {
    if (skill.editedBy !== null && visibleUserIds.has(skill.editedBy)) {
      result.set(skill.sId, userById.get(skill.editedBy) ?? null);
    }
  }

  return result;
}
