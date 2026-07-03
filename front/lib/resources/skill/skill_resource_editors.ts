import {
  filterUsersWithSharedMembership,
  hasSharedMembership,
} from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import type { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillResourceBase } from "@app/lib/resources/skill/skill_resource_base";
import { UserResource } from "@app/lib/resources/user_resource";
import { SKILL_GROUP_PREFIX } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import type { Transaction } from "sequelize";

/**
 * Layer of the SkillResource inheritance chain owning the skill editors
 * domain: the editors group lifecycle and the edited-by metadata.
 */
export abstract class SkillResourceWithEditors extends SkillResourceBase {
  /**
   * Creates a new skill editors group for the given skill and adds the creating
   * user to it.
   */
  protected static async makeNewSkillEditorsGroup(
    auth: Authenticator,
    skill: SkillConfigurationModel,
    {
      addCurrentUserAsEditor = true,
      transaction,
    }: {
      addCurrentUserAsEditor?: boolean;
      transaction?: Transaction;
    } = {}
  ): Promise<GroupResource> {
    const workspace = auth.getNonNullableWorkspace();

    assert(
      skill.workspaceId === workspace.id,
      "Unexpected: skill and workspace mismatch"
    );

    const defaultGroup = await GroupResource.makeNew(
      {
        workspaceId: workspace.id,
        name: `${SKILL_GROUP_PREFIX} ${skill.name} (skill:${skill.id})`,
        kind: "skill_editors",
      },
      {
        memberIds: addCurrentUserAsEditor ? [auth.getNonNullableUser().id] : [],
        transaction,
      }
    );

    await GroupSkillModel.create(
      {
        groupId: defaultGroup.id,
        skillConfigurationId: skill.id,
        workspaceId: workspace.id,
      },
      { transaction }
    );

    return defaultGroup;
  }

  async listEditors(auth: Authenticator): Promise<UserResource[] | null> {
    return this.editorGroup?.getActiveMembers(auth) ?? null;
  }

  async upsertEditors(
    auth: Authenticator,
    users: UserResource[]
  ): Promise<Result<void, Error>> {
    if (users.length === 0) {
      return new Ok(undefined);
    }

    if (!this.canWrite(auth)) {
      return new Err(
        new Error("User is not authorized to update skill editors.")
      );
    }

    if (!this.editorGroup) {
      return new Err(new Error("The skill does not have an editors group."));
    }

    const existingEditors = await this.listEditors(auth);
    const existingEditorIds = new Set(existingEditors?.map((u) => u.id) ?? []);
    const usersToAdd = users.filter((u) => !existingEditorIds.has(u.id));

    if (usersToAdd.length === 0) {
      return new Ok(undefined);
    }

    const addResult = await this.editorGroup.dangerouslyAddMembers(auth, {
      users: usersToAdd.map((u) => u.toJSON()),
    });
    if (addResult.isErr()) {
      return new Err(new Error(addResult.error.message));
    }

    return new Ok(undefined);
  }

  protected async upsertCurrentUserAsEditor(
    auth: Authenticator
  ): Promise<void> {
    const user = auth.user();
    if (!user) {
      return;
    }

    await this.upsertEditors(auth, [user]);
  }

  async fetchEditedByUser(auth: Authenticator): Promise<UserResource | null> {
    if (this.editedBy === null) {
      return null;
    }

    const editedByUser = await UserResource.fetchByModelId(this.editedBy);

    if (!editedByUser) {
      return null;
    }

    const shouldReturnEditedByUser = await hasSharedMembership(auth, {
      user: editedByUser,
    });

    return shouldReturnEditedByUser ? editedByUser : null;
  }

  /**
   * Batch list editors for multiple skills. Keyed by skill sId.
   */
  static async batchListEditors(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, UserResource[] | null>> {
    const result = new Map<string, UserResource[] | null>(
      skills.map((s) => [s.sId, null])
    );

    const skillsWithEditorGroups = skills.filter((s) => s.editorGroup !== null);

    if (skillsWithEditorGroups.length === 0) {
      return result;
    }

    const editorGroups = removeNulls(
      skillsWithEditorGroups.map((s) => s.editorGroup)
    );

    const membershipsByGroupId =
      await GroupResource.getActiveMembershipsForGroups(auth, editorGroups);

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

    for (const skill of skillsWithEditorGroups) {
      const groupId = skill.editorGroup!.id;
      const userIds = membershipsByGroupId[groupId] ?? [];
      const users = removeNulls(userIds.map((id) => userById.get(id) ?? null));
      result.set(skill.sId, users);
    }

    return result;
  }

  /**
   * Batch fetch edited-by users for multiple skills.
   */
  static async batchFetchEditedByUsers(
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
}
