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
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
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
import { launchUpdateSpacePermissionsWorkflow } from "@app/temporal/permissions_queue/client";
import type {
  CombinedResourcePermissions,
  GroupPermission,
  ModelId,
  Result,
  SpaceKind,
  SpaceType,
} from "@app/types";
import { Err, GLOBAL_SPACE_NAME, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
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
    groups: GroupResource[],
    transaction?: Transaction
  ) {
    return withTransaction(async (t: Transaction) => {
      const space = await SpaceModel.create(blob, { transaction: t });

      for (const group of groups) {
        await GroupSpaceModel.create(
          {
            groupId: group.id,
            vaultId: space.id,
            workspaceId: space.workspaceId,
          },
          { transaction: t }
        );
      }

      return new this(SpaceModel, space.get(), groups);
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
        [systemGroup],
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
        [globalGroup],
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
        [globalGroup],
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
    options?: { includeConversationsSpace?: boolean; includeDeleted?: boolean },
    t?: Transaction
  ): Promise<SpaceResource[]> {
    const spaces = await this.baseFetch(
      auth,
      {
        includeDeleted: options?.includeDeleted,
      },
      t
    );

    if (!options?.includeConversationsSpace) {
      return spaces.filter((s) => !s.isConversations());
    }
    return spaces;
  }

  static async listWorkspaceSpacesAsMember(auth: Authenticator) {
    const spaces = await this.baseFetch(auth);

    // Filtering to the spaces the auth can read that are not conversations.
    return spaces.filter((s) => s.canRead(auth) && !s.isConversations());
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
    groups: GroupResource[],
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
      "public",
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
    const spaceModelId = getResourceIdFromSId(sId);
    if (!spaceModelId) {
      return null;
    }

    const [space] = await this.baseFetch(auth, {
      where: { id: spaceModelId },
      includeDeleted,
    });

    return space;
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
      },
      transaction,
    });

    // Groups and spaces are currently tied together in a 1-1 way, even though the model allow a n-n relation between them.
    // When deleting a space, we delete the dangling groups as it won't be available in the UI anymore.
    // This should be changed when we separate the management of groups and spaces
    await concurrentExecutor(
      this.groups,
      async (group) => {
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

    await SpaceModel.destroy({
      where: {
        id: this.id,
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
    const regularGroups = this.groups.filter((g) => g.isRegular());
    if (regularGroups.length === 1 && (this.isRegular() || this.isPublic())) {
      await regularGroups[0].updateName(auth, `Group for space ${newName}`);
    }

    return new Ok(undefined);
  }

  // Permissions.

  async updatePermissions(
    auth: Authenticator,
    params:
      | { isRestricted: true; memberIds: string[]; managementMode: "manual" }
      | { isRestricted: true; groupIds: string[]; managementMode: "group" }
      | { isRestricted: false }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "group_not_found"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
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

    if (!this.isRegular()) {
      return new Err(
        new DustError("unauthorized", "Only regular spaces can have members.")
      );
    }

    const { isRestricted } = params;

    const regularGroups = this.groups.filter(
      (group) => group.kind === "regular"
    );

    // Ensure exactly one regular group is associated with the space.
    // IMPORTANT: This constraint is critical for the requestedPermissions() method logic.
    // Modifying this requires careful review and updates to requestedPermissions().
    assert(
      regularGroups.length === 1,
      `Expected exactly one regular group for the space, but found ${regularGroups.length}.`
    );
    const [defaultSpaceGroup] = regularGroups;

    const wasRestricted = this.groups.every((g) => !g.isGlobal());
    const hasRestrictionChanged = wasRestricted !== isRestricted;

    const groupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (groupRes.isErr()) {
      return groupRes;
    }

    const globalGroup = groupRes.value;

    return withTransaction(async (t) => {
      // Update managementMode if provided
      if (isRestricted) {
        const { managementMode } = params;

        // If the space should be restricted and was not restricted before, remove the global group.
        if (!wasRestricted) {
          await this.removeGroup(globalGroup);
        }

        await this.update({ managementMode }, t);

        if (managementMode === "manual") {
          const memberIds = params.memberIds;
          // Handle member-based management
          const users = await UserResource.fetchByIds(memberIds);

          const setMembersRes = await defaultSpaceGroup.setMembers(
            auth,
            users.map((u) => u.toJSON()),
            { transaction: t }
          );
          if (setMembersRes.isErr()) {
            return setMembersRes;
          }
        } else if (managementMode === "group") {
          // Handle group-based management
          const groupIds = params.groupIds;

          // Remove existing external groups
          const existingExternalGroups = this.groups.filter(
            (g) => g.kind === "provisioned"
          );
          for (const group of existingExternalGroups) {
            await GroupSpaceModel.destroy({
              where: {
                groupId: group.id,
                vaultId: this.id,
              },
              transaction: t,
            });
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
            await GroupSpaceModel.create(
              {
                groupId: selectedGroup.id,
                vaultId: this.id,
                workspaceId: this.workspaceId,
              },
              { transaction: t }
            );
          }
        }
      } else {
        // If the space should not be restricted and was restricted before, add the global group.
        if (wasRestricted) {
          await this.addGroup(globalGroup);
        }

        // Remove all members from default group.
        const setMembersRes = await defaultSpaceGroup.setMembers(auth, [], {
          transaction: t,
        });
        if (setMembersRes.isErr()) {
          return setMembersRes;
        }

        // Remove any external groups
        const externalGroups = this.groups.filter(
          (g) => g.kind === "provisioned"
        );
        for (const group of externalGroups) {
          await GroupSpaceModel.destroy({
            where: {
              groupId: group.id,
              vaultId: this.id,
            },
            transaction: t,
          });
        }
      }

      // If the restriction has changed, start a workflow to update all associated resource
      // permissions.
      if (hasRestrictionChanged) {
        await launchUpdateSpacePermissionsWorkflow(auth, this);
      }

      return new Ok(undefined);
    });
  }

  private async addGroup(group: GroupResource) {
    await GroupSpaceModel.create({
      groupId: group.id,
      vaultId: this.id,
      workspaceId: this.workspaceId,
    });
  }

  private async removeGroup(group: GroupResource) {
    await GroupSpaceModel.destroy({
      where: {
        groupId: group.id,
        vaultId: this.id,
      },
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
        | "system_or_global_group"
      >
    >
  > {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You do not have permission to add members to this space."
        )
      );
    }

    const defaultSpaceGroup = this.getDefaultSpaceGroup();
    const users = await UserResource.fetchByIds(userIds);

    if (!users) {
      return new Err(new DustError("user_not_found", "User not found."));
    }

    const addMemberRes = await defaultSpaceGroup.addMembers(
      auth,
      users.map((user) => user.toJSON())
    );

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
      >
    >
  > {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You do not have permission to add members to this space."
        )
      );
    }

    const defaultSpaceGroup = this.getDefaultSpaceGroup();
    const users = await UserResource.fetchByIds(userIds);

    if (!users) {
      return new Err(new DustError("user_not_found", "User not found."));
    }

    const removeMemberRes = await defaultSpaceGroup.removeMembers(
      auth,
      users.map((user) => user.toJSON())
    );

    if (removeMemberRes.isErr()) {
      return removeMemberRes;
    }

    return new Ok(users);
  }

  private getDefaultSpaceGroup(): GroupResource {
    const regularGroups = this.groups.filter(
      (group) => group.kind === "regular"
    );
    assert(
      regularGroups.length === 1,
      `Expected exactly one regular group for the space, but found ${regularGroups.length}.`
    );
    return regularGroups[0];
  }

  /**
   * Computes resource permissions based on space type and group configuration.
   *
   * Permission patterns by space type:
   *
   * 1. System spaces:
   * - Restricted to workspace admins only
   *
   * 2. Public spaces:
   * - Read: Anyone
   * - Write: Workspace admins and builders
   *
   * 3. Global spaces:
   * - Read: All workspace members
   * - Write: Workspace admins and builders
   *
   * 4. Open spaces:
   * - Read: All workspace members
   * - Write: Admins and builders
   *
   * 5. Restricted spaces:
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

    // Public space.
    if (this.isPublic()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [
            { role: "admin", permissions: ["admin", "read", "write"] },
            { role: "builder", permissions: ["read", "write"] },
            { role: "user", permissions: ["read"] },
            // Everyone can read.
            { role: "none", permissions: ["read"] },
          ],
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

    // Restricted space.
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

  isConversations() {
    return this.kind === "conversations";
  }

  isRegular() {
    return this.kind === "regular";
  }

  isRegularAndRestricted() {
    return this.isRegular() && !this.groups.some((group) => group.isGlobal());
  }

  isRegularAndOpen() {
    return this.isRegular() && this.groups.some((group) => group.isGlobal());
  }

  isPublic() {
    return this.kind === "public";
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

  toJSON(): SpaceType {
    return {
      createdAt: this.createdAt.getTime(),
      groupIds: this.groups.map((group) => group.sId),
      isRestricted: this.isRegularAndRestricted(),
      kind: this.kind,
      managementMode: this.managementMode,
      name: this.name,
      sId: this.sId,
      updatedAt: this.updatedAt.getTime(),
    };
  }
}
