import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  Includeable,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceEditorResource } from "@app/lib/resources/group_space_editor_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { GroupSpaceViewerResource } from "@app/lib/resources/group_space_viewer_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticSoftDeletable } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { GroupType } from "@app/types/groups";
import {
  GLOBAL_SPACE_NAME,
  PROJECT_EDITOR_GROUP_PREFIX,
} from "@app/types/groups";
import type {
  CombinedResourcePermissions,
  GroupPermission,
} from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SpaceKind, SpaceType } from "@app/types/space";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SpaceResource extends ReadonlyAttributesType<SpaceModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SpaceResource extends BaseResource<SpaceModel> {
  static model: ModelStaticSoftDeletable<SpaceModel> = SpaceModel;

  constructor(
    model: ModelStaticSoftDeletable<SpaceModel>,
    blob: Attributes<SpaceModel>,
    readonly groups: GroupResource[]
  ) {
    super(SpaceModel, blob);
  }

  static fromModel(space: SpaceModel) {
    return new SpaceResource(
      SpaceModel,
      space.get(),
      space.groups.map((group) => new GroupResource(GroupModel, group.get()))
    );
  }

  static async makeNew(
    blob: CreationAttributes<SpaceModel>,
    groups: { members: GroupResource[]; editors?: GroupResource[] },
    transaction?: Transaction
  ) {
    return withTransaction(async (t: Transaction) => {
      const space = await SpaceModel.create(blob, { transaction: t });
      const { members, editors = [] } = groups;

      for (const memberGroup of members) {
        await GroupSpaceModel.create(
          {
            groupId: memberGroup.id,
            vaultId: space.id,
            workspaceId: space.workspaceId,
            kind: "member",
          },
          { transaction: t }
        );
      }
      if (editors.length > 0) {
        assert(
          blob.kind === "project",
          "Only projects can have editor groups."
        );
        for (const editorGroup of editors) {
          await GroupSpaceModel.create(
            {
              groupId: editorGroup.id,
              vaultId: space.id,
              workspaceId: space.workspaceId,
              kind: "project_editor",
            },
            { transaction: t }
          );
        }
      }

      return new this(SpaceModel, space.get(), [
        ...groups.members,
        ...(groups.editors ?? []),
      ]);
    }, transaction);
  }

  static async makeDefaultsForWorkspace(
    auth: Authenticator,
    {
      systemGroup,
      globalGroup,
    }: {
      systemGroup: GroupResource;
      globalGroup: GroupResource;
    },
    transaction?: Transaction
  ) {
    assert(auth.isAdmin(), "Only admins can call `makeDefaultsForWorkspace`");

    const existingSpaces = await this.listWorkspaceDefaultSpaces(auth, {
      includeConversationsSpace: true,
    });
    const systemSpace =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      existingSpaces.find((s) => s.isSystem()) ||
      (await SpaceResource.makeNew(
        {
          name: "System",
          kind: "system",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        { members: [systemGroup] },
        transaction
      ));

    const globalSpace =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      existingSpaces.find((s) => s.isGlobal()) ||
      (await SpaceResource.makeNew(
        {
          name: GLOBAL_SPACE_NAME,
          kind: "global",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        { members: [globalGroup] },
        transaction
      ));

    const conversationsSpace =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      existingSpaces.find((s) => s.isConversations()) ||
      (await SpaceResource.makeNew(
        {
          name: "Conversations",
          kind: "conversations",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        { members: [globalGroup] },
        transaction
      ));

    return {
      systemSpace,
      globalSpace,
      conversationsSpace,
    };
  }

  get sId(): string {
    return SpaceResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("space", {
      id,
      workspaceId,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    {
      includes,
      limit,
      order,
      where,
      includeDeleted,
    }: ResourceFindOptions<SpaceModel> = {},
    t?: Transaction
  ) {
    const includeClauses: Includeable[] = [
      {
        model: GroupResource.model,
      },
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      ...(includes || []),
    ];

    const spacesModels = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<SpaceModel>,
      include: includeClauses,
      limit,
      order,
      includeDeleted,
      transaction: t,
    });

    return spacesModels.map(this.fromModel);
  }

  static async listWorkspaceSpaces(
    auth: Authenticator,
    options?: {
      includeConversationsSpace?: boolean;
      includeProjectSpaces?: boolean;
      includeDeleted?: boolean;
    },
    t?: Transaction
  ): Promise<SpaceResource[]> {
    const spaces = await this.baseFetch(
      auth,
      {
        includeDeleted: options?.includeDeleted,
        where: {
          kind: {
            [Op.in]: [
              "system",
              "global",
              "regular",
              ...(options?.includeConversationsSpace ? ["conversations"] : []),
              ...(options?.includeProjectSpaces ? ["project"] : []),
            ],
          },
        },
      },
      t
    );

    return spaces;
  }

  static async listWorkspaceSpacesAsMember(auth: Authenticator) {
    const spaces = await this.baseFetch(auth);

    // TODO(projects): we might want to filter early on the groups membership to avoid fetching all spaces and then filtering.
    return spaces.filter((s) => s.isMember(auth));
  }

  static async listWorkspaceDefaultSpaces(
    auth: Authenticator,
    options?: { includeConversationsSpace?: boolean }
  ) {
    return this.baseFetch(auth, {
      where: {
        kind: {
          [Op.in]: [
            "system",
            "global",
            ...(options?.includeConversationsSpace ? ["conversations"] : []),
          ],
        },
      },
    });
  }

  static async listForGroups(
    auth: Authenticator,
    groups: (GroupResource | GroupType)[],
    options?: { includeConversationsSpace?: boolean }
  ) {
    const groupSpaces = await GroupSpaceModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        groupId: groups.map((g) => g.id),
      },
    });

    const allExceptConversations: Exclude<SpaceKind, "conversations">[] = [
      "system",
      "global",
      "regular",
      "project",
    ];

    let spaces: SpaceResource[] = [];

    if (options?.includeConversationsSpace) {
      spaces = await this.baseFetch(auth, {
        where: {
          id: groupSpaces.map((v) => v.vaultId),
        },
      });
    } else {
      spaces = await this.baseFetch(auth, {
        where: {
          id: groupSpaces.map((v) => v.vaultId),
          kind: {
            [Op.in]: allExceptConversations,
          },
        },
      });
    }

    return spaces.filter((s) => s.canRead(auth));
  }

  static async canAdministrateSystemSpace(auth: Authenticator) {
    const systemSpace = await this.fetchWorkspaceSystemSpace(auth);
    return systemSpace.canAdministrate(auth);
  }

  static async fetchWorkspaceSystemSpace(
    auth: Authenticator
  ): Promise<SpaceResource> {
    const [space] = await this.baseFetch(auth, { where: { kind: "system" } });

    if (!space) {
      throw new Error("System space not found.");
    }

    return space;
  }

  static async fetchWorkspaceGlobalSpace(
    auth: Authenticator
  ): Promise<SpaceResource> {
    const [space] = await this.baseFetch(auth, { where: { kind: "global" } });

    if (!space) {
      throw new Error("Global space not found.");
    }

    return space;
  }

  static async fetchWorkspaceConversationsSpace(
    auth: Authenticator
  ): Promise<SpaceResource> {
    const [space] = await this.baseFetch(auth, {
      where: { kind: "conversations" },
    });

    if (!space) {
      throw new Error("Conversations space not found.");
    }

    return space;
  }

  static async fetchById(
    auth: Authenticator,
    sId: string,
    { includeDeleted }: { includeDeleted?: boolean } = {}
  ): Promise<SpaceResource | null> {
    const [space] = await this.fetchByIds(auth, [sId], { includeDeleted });
    return space ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    { includeDeleted }: { includeDeleted?: boolean } = {}
  ): Promise<SpaceResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: removeNulls(ids.map(getResourceIdFromSId)),
      },
      includeDeleted,
    });
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[],
    { includeDeleted }: { includeDeleted?: boolean } = {}
  ) {
    const spaces = await this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: ids,
        },
      },
      includeDeleted,
    });

    return spaces ?? [];
  }

  static async isNameAvailable(
    auth: Authenticator,
    name: string,
    t?: Transaction
  ): Promise<boolean> {
    const owner = auth.getNonNullableWorkspace();

    const space = await this.model.findOne({
      where: {
        name,
        workspaceId: owner.id,
      },
      transaction: t,
    });

    return !space;
  }

  async delete(
    auth: Authenticator,
    options: { hardDelete: boolean; transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    const { hardDelete, transaction } = options;

    await GroupSpaceModel.destroy({
      where: {
        vaultId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    // Groups and spaces are currently tied together in a 1-1 way, even though the model allow a n-n relation between them.
    // When deleting a space, we delete the dangling groups as it won't be available in the UI anymore.
    // This should be changed when we separate the management of groups and spaces
    await concurrentExecutor(
      this.groups,
      async (group) => {
        // Provisioned groups are not tied to any space, we don't delete them.
        if (group.kind === "provisioned") {
          return;
        }
        // As the model allows it, ensure the group is not associated with any other space.
        const count = await GroupSpaceModel.count({
          where: {
            groupId: group.id,
          },
          transaction,
        });
        if (count === 0) {
          await group.delete(auth, { transaction });
        }
      },
      {
        concurrency: 8,
      }
    );

    await AgentProjectConfigurationModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectId: this.id,
      },
      transaction,
    });

    await SpaceModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
      hardDelete,
    });

    return new Ok(undefined);
  }

  async updateName(
    auth: Authenticator,
    newName: string
  ): Promise<Result<undefined, Error>> {
    if (!auth.isAdmin()) {
      return new Err(new Error("Only admins can update space names."));
    }

    const nameAvailable = await SpaceResource.isNameAvailable(auth, newName);
    if (!nameAvailable) {
      return new Err(new Error("This space name is already used."));
    }

    await this.update({ name: newName });
    // For regular spaces that only have a single group, update
    // the group's name too (see https://github.com/dust-tt/tasks/issues/1738)
    const regularGroup = this.getSpaceManualMemberGroup();
    if (this.isRegular()) {
      await regularGroup.updateName(
        auth,
        `Group for ${this.isProject() ? "project" : "space"} ${newName}`
      );
    }
    const spaceEditorGroup = this.getSpaceManualEditorGroup();
    if (spaceEditorGroup && this.isRegular()) {
      await spaceEditorGroup.updateName(
        auth,
        `Editors for ${this.isProject() ? "project" : "space"} ${newName}`
      );
    }

    return new Ok(undefined);
  }

  // Permissions.

  async updatePermissions(
    auth: Authenticator,
    params: {
      name: string;
      isRestricted: boolean;
    } & (
      | { memberIds: string[]; managementMode: "manual"; editorIds: string[] }
      | {
          groupIds: string[];
          managementMode: "group";
          editorGroupIds: string[];
        }
    )
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "group_not_found"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
        | "invalid_id"
      >
    >
  > {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You do not have permission to update space permissions."
        )
      );
    }

    if (!this.isRegular() && !this.isProject()) {
      return new Err(
        new DustError(
          "unauthorized",
          "Only projects and regular spaces can have members."
        )
      );
    }

    const { isRestricted } = params;

    const wasRestricted = this.groups.every((g) => !g.isGlobal());

    const groupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (groupRes.isErr()) {
      return groupRes;
    }

    const globalGroup = groupRes.value;

    return withTransaction(async (t) => {
      // Update managementMode if provided
      const { managementMode } = params;

      // If the space should be restricted and was not restricted before, remove the global group.
      if (!wasRestricted && isRestricted) {
        await this.removeGroup(auth, globalGroup, t);
      }

      // If the space should not be restricted and was restricted before, add the global group.
      if (wasRestricted && !isRestricted) {
        if (this.isProject()) {
          // Global group gets viewer permissions in projects
          await GroupSpaceViewerResource.makeNew(auth, {
            group: globalGroup,
            space: this,
            transaction: t,
          });
        } else {
          await GroupSpaceMemberResource.makeNew(auth, {
            group: globalGroup,
            space: this,
            transaction: t,
          });
        }
      }

      const previousManagementMode = this.managementMode;
      await this.update({ managementMode }, t);

      // Handle member status updates based on management mode changes
      if (previousManagementMode !== managementMode) {
        if (managementMode === "group") {
          // When switching to group mode, suspend all active members of the default group
          await this.suspendManualGroupMembers(auth, t);
        } else if (
          managementMode === "manual" &&
          previousManagementMode === "group"
        ) {
          // When switching from group to manual mode, restore suspended members
          await this.restoreManualGroupMembers(auth, t);
        }
      }

      if (managementMode === "manual") {
        const memberIds = params.memberIds;
        const editorIds = params.editorIds;

        assert(
          memberIds.every((id) => !editorIds.includes(id)),
          "A user cannot be both a member and an editor of the same space."
        );

        // Handle member-based management
        const users = await UserResource.fetchByIds(memberIds);

        // Get the GroupSpaceMemberResource for the member group
        const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
          space: this,
          transaction: t,
          filterOnManagementMode: true,
        });

        assert(
          memberGroupSpaces.length === 1,
          "In manual management mode, there should be exactly one member group space."
        );

        const setMembersRes = await memberGroupSpaces[0].setMembers(auth, {
          users: users.map((u) => u.toJSON()),
          transaction: t,
        });
        if (setMembersRes.isErr()) {
          return setMembersRes;
        }

        // Handle editor group - create if needed and update members
        if (this.isProject()) {
          let editorGroupSpaces = await GroupSpaceEditorResource.fetchBySpace({
            space: this,
            transaction: t,
            filterOnManagementMode: true,
          });

          if (!editorGroupSpaces.length) {
            // Create a new editor group
            const editorGroup = await GroupResource.makeNew(
              {
                name: `${PROJECT_EDITOR_GROUP_PREFIX} ${this.name}`,
                kind: "space_editors",
                workspaceId: this.workspaceId,
              },
              { transaction: t }
            );

            // Link the editor group to the space
            const editorGroupSpace = await GroupSpaceEditorResource.makeNew(
              auth,
              {
                group: editorGroup,
                space: this,
                transaction: t,
              }
            );
            editorGroupSpaces = [editorGroupSpace];
          }
          assert(
            editorGroupSpaces.length === 1,
            "In manual management mode, there should be exactly one editor group space."
          );

          // Set members of the editor group using the GroupSpaceEditorResource
          const editorUsers = await UserResource.fetchByIds(editorIds);
          assert(
            editorUsers.length > 0,
            "Projects must have at least one editor."
          );
          const setEditorsRes = await editorGroupSpaces[0].setMembers(auth, {
            users: editorUsers.map((u) => u.toJSON()),
            transaction: t,
          });
          if (setEditorsRes.isErr()) {
            return setEditorsRes;
          }
        }
      } else if (managementMode === "group") {
        // Handle group-based management
        const groupIds = params.groupIds;
        const editorGroupIds = params.editorGroupIds;

        // Remove existing external groups
        const existingExternalGroups = this.groups.filter(
          (g) => g.kind === "provisioned"
        );
        for (const group of existingExternalGroups) {
          await this.removeGroup(auth, group, t);
        }

        // Add the new groups
        const selectedGroupsResult = await GroupResource.fetchByIds(
          auth,
          groupIds
        );
        if (selectedGroupsResult.isErr()) {
          return selectedGroupsResult;
        }
        const selectedGroups = selectedGroupsResult.value;
        for (const selectedGroup of selectedGroups) {
          await GroupSpaceMemberResource.makeNew(auth, {
            group: selectedGroup,
            space: this,
            transaction: t,
          });
        }

        if (this.isProject()) {
          assert(
            editorGroupIds.length > 0,
            "Projects must have at least one editor group."
          );
          // Add the new editor groups
          const editorGroupsResult = await GroupResource.fetchByIds(
            auth,
            editorGroupIds
          );
          if (editorGroupsResult.isErr()) {
            return editorGroupsResult;
          }
          const selectedEditorGroups = editorGroupsResult.value;
          assert(
            selectedEditorGroups.length > 0,
            "Projects must have at least one editor group."
          );
          for (const selectedEditorGroup of selectedEditorGroups) {
            await GroupSpaceEditorResource.makeNew(auth, {
              group: selectedEditorGroup,
              space: this,
              transaction: t,
            });
          }
        }
      }

      return new Ok(undefined);
    });
  }

  private async removeGroup(
    auth: Authenticator,
    group: GroupResource,
    transaction?: Transaction
  ) {
    await GroupSpaceModel.destroy({
      where: {
        groupId: group.id,
        vaultId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
  }

  async addMembers(
    auth: Authenticator,
    {
      userIds,
    }: {
      userIds: string[];
    }
  ): Promise<
    Result<
      UserResource[],
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
        | "group_not_found"
      >
    >
  > {
    assert(
      this.isRegular() || this.isProject(),
      "Only regular spaces and projects can have manual members."
    );
    assert(
      this.managementMode === "manual",
      "Can only add members in manual management mode."
    );

    const users = await UserResource.fetchByIds(userIds);

    if (!users) {
      return new Err(new DustError("user_not_found", "User not found."));
    }

    const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
      space: this,
      filterOnManagementMode: true,
    });

    assert(
      memberGroupSpaces.length === 1,
      "In manual management mode, there should be exactly one member group space."
    );

    const addMemberRes = await memberGroupSpaces[0].addMembers(auth, {
      users: users.map((user) => user.toJSON()),
    });

    if (addMemberRes.isErr()) {
      return addMemberRes;
    }

    return new Ok(users);
  }

  async removeMembers(
    auth: Authenticator,
    {
      userIds,
    }: {
      userIds: string[];
    }
  ): Promise<
    Result<
      UserResource[],
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "system_or_global_group"
        | "group_not_found"
      >
    >
  > {
    const users = await UserResource.fetchByIds(userIds);

    if (!users) {
      return new Err(new DustError("user_not_found", "User not found."));
    }

    // Get the GroupSpaceMemberResource for the member group
    const memberGroupSpaces = await GroupSpaceMemberResource.fetchBySpace({
      space: this,
      filterOnManagementMode: true,
    });

    assert(
      memberGroupSpaces.length === 1,
      "In manual management mode, there should be exactly one member group space."
    );

    const removeMemberRes = await memberGroupSpaces[0].removeMembers(auth, {
      users: users.map((user) => user.toJSON()),
    });

    if (removeMemberRes.isErr()) {
      return removeMemberRes;
    }

    return new Ok(users);
  }

  private getSpaceManualMemberGroup(): GroupResource {
    const regularGroups = this.groups.filter(
      (group) => group.kind === "regular"
    );
    assert(
      regularGroups.length === 1,
      `Expected exactly one regular group for the space, but found ${regularGroups.length}.`
    );
    return regularGroups[0];
  }

  private getSpaceManualEditorGroup(): GroupResource | null {
    const editorGroups = this.groups.filter(
      (group) => group.kind === "space_editors"
    );
    if (editorGroups.length === 0) {
      return null;
    }
    assert(
      editorGroups.length === 1,
      `Expected at most one space editors group for the space, but found ${editorGroups.length}.`
    );
    return editorGroups[0];
  }

  /**
   * Check if the auth is a member of this space.
   */

  isMember(auth: Authenticator): boolean {
    // TODO(projects): update this method to check groups whose group_vaults relationship is
    // to remove the complexity of checking the global group based on the space type.
    switch (this.kind) {
      case "regular":
        for (const group of this.groups) {
          // In regular spaces, having the global group means that you are a member.
          if (group.isGlobal()) {
            return true;
          }
          if (auth.hasGroupByModelId(group.id)) {
            return true;
          }
        }
        return false;
      case "project":
        for (const group of this.groups) {
          // Ignore the global group for project spaces as it means that the group is public but not that you are a member.
          if (group.isGlobal()) {
            continue;
          }
          if (auth.hasGroupByModelId(group.id)) {
            return true;
          }
        }
        return false;
      case "global":
        return true;
      case "conversations":
      case "system":
        return false;

      default:
        assertNever(this.kind);
    }
  }

  // TODO(projects): update this method to check groups whose group_vaults relationship is
  // space_editor (not space_viewer or space_member) when the PR adding the relationship is live.
  isEditor(auth: Authenticator): boolean {
    return this.isMember(auth);
  }

  /**
   * Computes resource permissions based on space type and group configuration.
   *
   * Permission patterns by space type:
   *
   * 1. System spaces:
   * - Restricted to workspace admins only
   *
   * 2. Global spaces:
   * - Read: All workspace members
   * - Write: Workspace admins and builders
   *
   * 3. Open spaces:
   * - Read: All workspace members
   * - Write: Admins and builders
   *
   * 4. Restricted spaces:
   * - Read/Write: Group members
   * - Admin: Workspace admins
   *
   * @returns Array of ResourcePermission objects based on space type
   */
  requestedPermissions(): CombinedResourcePermissions[] {
    // System space.
    if (this.isSystem()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [{ role: "admin", permissions: ["admin", "write"] }],
          groups: this.groups.map((group) => ({
            id: group.id,
            permissions: ["read", "write"],
          })),
        },
      ];
    }

    // Global Workspace space and Conversations space.
    if (this.isGlobal() || this.isConversations()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [
            { role: "admin", permissions: ["admin", "read", "write"] },
            { role: "builder", permissions: ["read", "write"] },
          ],
          groups: this.groups.map((group) => ({
            id: group.id,
            permissions: ["read"],
          })),
        },
      ];
    }

    const groupFilter =
      this.managementMode === "manual"
        ? (group: GroupResource) => !group.isProvisioned()
        : () => true;

    // Open space.
    // Currently only using global group for simplicity.
    // TODO(2024-10-25 flav): Refactor to store a list of ResourcePermission on conversations and
    // agent_configurations. This will allow proper handling of multiple groups instead of only
    // using the global group as a temporary solution.
    if (this.isRegularAndOpen()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [
            { role: "admin", permissions: ["admin", "read", "write"] },
            { role: "builder", permissions: ["read", "write"] },
            { role: "user", permissions: ["read"] },
          ],
          groups: this.groups.reduce((acc, group) => {
            if (groupFilter(group)) {
              acc.push({
                id: group.id,
                permissions: ["read"],
              });
            }
            return acc;
          }, [] as GroupPermission[]),
        },
      ];
    }

    if (this.isProject()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [
            { role: "admin", permissions: ["admin", "read", "write"] },
            { role: "user", permissions: this.isOpen() ? ["read"] : [] }, // Non-restricted projects are visible to all users
          ],
          groups: this.groups.reduce((acc, group) => {
            if (groupFilter(group)) {
              const groupKind = group.group_vaults?.kind;
              if (groupKind === "project_editor") {
                // Project editors get admin permissions
                acc.push({
                  id: group.id,
                  permissions: ["admin", "read", "write"],
                });
              } else {
                // Members get read permissions in restricted projects (the unrestricted case is handled by the roles above)
                acc.push({
                  id: group.id,
                  permissions: ["read", "write"],
                });
              }
            }
            return acc;
          }, [] as GroupPermission[]),
        },
      ];
    }

    // Restricted regular space.
    return [
      {
        workspaceId: this.workspaceId,
        roles: [{ role: "admin", permissions: ["admin"] }],
        groups: this.groups.reduce((acc, group) => {
          if (groupFilter(group)) {
            acc.push({
              id: group.id,
              permissions: ["read", "write"],
            });
          }
          return acc;
        }, [] as GroupPermission[]),
      },
    ];
  }

  canAdministrate(auth: Authenticator) {
    return auth.canAdministrate(this.requestedPermissions());
  }

  canWrite(auth: Authenticator) {
    return auth.canWrite(this.requestedPermissions());
  }

  canRead(auth: Authenticator) {
    return auth.canRead(this.requestedPermissions());
  }

  canReadOrAdministrate(auth: Authenticator) {
    return this.canRead(auth) || this.canAdministrate(auth);
  }

  isGlobal() {
    return this.kind === "global";
  }

  isSystem() {
    return this.kind === "system";
  }

  // This is a bit confusing (but temporary) because the "conversations" kind is a special kind of space to hold all conversations files (legacy).
  // It's different from a space that support having conversations.
  isConversations() {
    return this.kind === "conversations";
  }

  isRegular() {
    return this.kind === "regular";
  }
  isProject() {
    return this.kind === "project";
  }

  isRegularAndRestricted() {
    return this.isRegular() && !this.isOpen();
  }

  isProjectAndRestricted() {
    return this.isProject() && !this.isOpen();
  }

  isRegularAndOpen() {
    return this.isRegular() && this.isOpen();
  }

  isOpen() {
    return this.groups.some((group) => group.isGlobal());
  }

  isDeletable() {
    return (
      // Soft-deleted spaces can be deleted.
      this.deletedAt !== null ||
      // Also, defaults spaces can be deleted.
      this.isGlobal() ||
      this.isSystem() ||
      this.isConversations()
    );
  }

  // Serialization.

  /**
   * Suspends all active members of the default group when switching to group management mode
   */
  private async suspendManualGroupMembers(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<void> {
    const spaceManualMemberGroup = this.getSpaceManualMemberGroup();

    await GroupMembershipModel.update(
      { status: "suspended" },
      {
        where: {
          groupId: spaceManualMemberGroup.id,
          workspaceId: this.workspaceId,
          status: "active",
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
        transaction,
      }
    );

    const spaceManualEditorGroup = this.getSpaceManualEditorGroup();
    if (spaceManualEditorGroup) {
      await GroupMembershipModel.update(
        { status: "suspended" },
        {
          where: {
            groupId: spaceManualEditorGroup.id,
            workspaceId: this.workspaceId,
            status: "active",
            startAt: { [Op.lte]: new Date() },
            [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
          },
          transaction,
        }
      );
    }
  }

  /**
   * Restores all suspended members of the default group when switching to manual management mode
   */
  private async restoreManualGroupMembers(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<void> {
    const spaceManualMemberGroup = this.getSpaceManualMemberGroup();
    await GroupMembershipModel.update(
      { status: "active" },
      {
        where: {
          groupId: spaceManualMemberGroup.id,
          workspaceId: this.workspaceId,
          status: "suspended",
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
        transaction,
      }
    );

    const spaceManualEditorGroup = this.getSpaceManualEditorGroup();
    if (spaceManualEditorGroup) {
      await GroupMembershipModel.update(
        { status: "active" },
        {
          where: {
            groupId: spaceManualEditorGroup.id,
            workspaceId: this.workspaceId,
            status: "suspended",
            startAt: { [Op.lte]: new Date() },
            [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
          },
          transaction,
        }
      );
    }
  }

  /**
   * Fetches group memberships for this space's regular and editor groups
   * @param auth - Authenticator for workspace context
   * @param shouldIncludeAllMembers - If true, includes all members (active and revoked); if false, only active members
   * @returns Object containing the groups to process and their memberships
   */
  async fetchManualGroupsMemberships(
    auth: Authenticator,
    {
      shouldIncludeAllMembers = false,
    }: {
      shouldIncludeAllMembers?: boolean;
    } = {}
  ): Promise<{
    groupsToProcess: GroupResource[];
    allGroupMemberships: GroupMembershipModel[];
  }> {
    const groupsToProcess = this.groups.filter((g) => {
      return g.kind === "regular" || g.kind === "space_editors";
    });

    // Fetch all group memberships to get the startAt date (will be the joinedAt date returned for each member)
    const allGroupMemberships = await GroupMembershipModel.findAll({
      where: {
        groupId: {
          [Op.in]: groupsToProcess.map((g) => g.id),
        },
        workspaceId: auth.getNonNullableWorkspace().id,
        ...(shouldIncludeAllMembers
          ? {
              startAt: { [Op.lte]: new Date() },
              [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
            }
          : {
              status: "active",
              startAt: { [Op.lte]: new Date() },
              [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
            }),
      },
    });

    return {
      groupsToProcess,
      allGroupMemberships,
    };
  }

  toJSON(): SpaceType {
    return {
      createdAt: this.createdAt.getTime(),
      groupIds: this.groups.map((group) => group.sId),
      isRestricted:
        this.isRegularAndRestricted() || this.isProjectAndRestricted(),

      kind: this.kind,
      managementMode: this.managementMode,
      name: this.name,
      sId: this.sId,
      updatedAt: this.updatedAt.getTime(),
    };
  }
}
