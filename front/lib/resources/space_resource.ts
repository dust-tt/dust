import type {
  ACLType,
  ModelId,
  PokeSpaceType,
  Result,
  SpaceType,
} from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import { assertNever, Ok } from "@dust-tt/types";
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
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticSoftDeletable } from "@app/lib/resources/storage/wrappers";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";

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

  static fromModel(vault: SpaceModel) {
    return new SpaceResource(
      SpaceModel,
      vault.get(),
      vault.groups.map((group) => new GroupResource(GroupModel, group.get()))
    );
  }

  static async makeNew(
    blob: CreationAttributes<SpaceModel>,
    groups: GroupResource[]
  ) {
    return frontSequelize.transaction(async (transaction) => {
      const vault = await SpaceModel.create(blob, { transaction });

      for (const group of groups) {
        await GroupSpaceModel.create(
          {
            groupId: group.id,
            vaultId: vault.id,
          },
          { transaction }
        );
      }

      return new this(SpaceModel, vault.get(), groups);
    });
  }

  static async makeDefaultsForWorkspace(
    auth: Authenticator,
    {
      systemGroup,
      globalGroup,
    }: {
      systemGroup: GroupResource;
      globalGroup: GroupResource;
    }
  ) {
    assert(auth.isAdmin(), "Only admins can call `makeDefaultsForWorkspace`");

    const existingSpaces = await this.listWorkspaceDefaultSpaces(auth);
    const systemSpace =
      existingSpaces.find((s) => s.kind === "system") ||
      (await SpaceResource.makeNew(
        {
          name: "System",
          kind: "system",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        [systemGroup]
      ));

    const globalSpace =
      existingSpaces.find((s) => s.kind === "global") ||
      (await SpaceResource.makeNew(
        {
          name: "Company Data",
          kind: "global",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        [globalGroup]
      ));

    return {
      systemSpace,
      globalSpace,
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
    return makeSId("vault", {
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
    }: ResourceFindOptions<SpaceModel> = {}
  ) {
    const includeClauses: Includeable[] = [
      {
        model: GroupResource.model,
      },
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
    });

    return spacesModels.map(this.fromModel);
  }

  static async listWorkspaceSpaces(
    auth: Authenticator
  ): Promise<SpaceResource[]> {
    const spaces = await this.baseFetch(auth);

    return spaces.filter((s) => s.canList(auth));
  }

  static async listWorkspaceSpacesAsMember(auth: Authenticator) {
    const spaces = await this.baseFetch(auth);

    // using canRead() as we know that only members can read spaces (but admins can list them)
    return spaces.filter((s) => s.canList(auth) && s.canRead(auth));
  }

  static async listWorkspaceDefaultSpaces(auth: Authenticator) {
    return this.baseFetch(auth, {
      where: {
        kind: {
          [Op.in]: ["system", "global"],
        },
      },
    });
  }

  static async listForGroups(auth: Authenticator, groups: GroupResource[]) {
    const groupSpaces = await GroupSpaceModel.findAll({
      where: {
        groupId: groups.map((g) => g.id),
      },
    });

    const spaces = await this.baseFetch(auth, {
      where: {
        id: groupSpaces.map((v) => v.vaultId),
      },
    });

    return spaces.filter((s) => s.canRead(auth));
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
    name: string
  ): Promise<boolean> {
    const owner = auth.getNonNullableWorkspace();

    const space = await this.model.findOne({
      where: {
        name,
        workspaceId: owner.id,
      },
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
    return new Ok(undefined);
  }

  // Permissions.

  async updatePermissions(
    auth: Authenticator,
    {
      isRestricted,
      memberIds,
    }: { isRestricted: boolean; memberIds: string[] | null }
  ): Promise<Result<undefined, DustError>> {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You do not have permission to update space permissions."
        )
      );
    }

    const regularGroups = this.groups.filter(
      (group) => group.kind === "regular"
    );

    // Ensure exactly one regular group is associated with the space.
    // IMPORTANT: This constraint is critical for the acl() method logic.
    // Modifying this requires careful review and updates to acl().
    assert(
      regularGroups.length === 1,
      `Expected exactly one regular group for the space, but found ${regularGroups.length}.`
    );
    const [defaultSpaceGroup] = regularGroups;

    const wasRestricted = this.groups.every((g) => !g.isGlobal());

    const groupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (groupRes.isErr()) {
      return groupRes;
    }

    const globalGroup = groupRes.value;
    if (isRestricted) {
      // If the space should be restricted and was not restricted before, remove the global group.
      if (!wasRestricted) {
        await this.removeGroup(globalGroup);
      }

      if (memberIds) {
        const users = await UserResource.fetchByIds(memberIds);

        return defaultSpaceGroup.setMembers(
          auth,
          users.map((u) => u.toJSON())
        );
      }

      return new Ok(undefined);
    } else {
      // If the space should not be restricted and was restricted before, add the global group.
      if (wasRestricted) {
        await this.addGroup(globalGroup);
      }

      // Remove all members.
      await defaultSpaceGroup.setMembers(auth, []);

      return new Ok(undefined);
    }
  }

  private async addGroup(group: GroupResource) {
    await GroupSpaceModel.create({
      groupId: group.id,
      vaultId: this.id,
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

  /**
   * Determine ACL entries based on vault type and group configuration:
   * 1. For regular vaults with a global group:
   *    - Return only the global group with full permissions
   *    - Ignore regular groups as they're not used in non-restricted vaults
   * 2. For all the other vaults:
   *    - Return all associated groups with full permissions
   */
  acl(): ACLType {
    const globalGroup = this.isRegular()
      ? this.groups.find((group) => group.isGlobal())
      : undefined;
    if (globalGroup) {
      return {
        aclEntries: [
          {
            groupId: globalGroup.id,
            permissions: ["read", "write"],
          },
        ],
      };
    }

    return {
      aclEntries: this.groups.map((group) => ({
        groupId: group.id,
        permissions: ["read", "write"],
      })),
    };
  }

  canAdministrate(auth: Authenticator) {
    return auth.isAdmin();
  }

  canWrite(auth: Authenticator) {
    switch (this.kind) {
      case "system":
        return auth.isAdmin() && auth.canWrite([this.acl()]);

      case "global":
        return auth.isBuilder() && auth.canWrite([this.acl()]);

      case "regular":
        // TODO(SPACE_INFRA): Represent this in ACL.
        // In the meantime, if the vault has a global group, only builders can write.
        if (this.groups.some((group) => group.isGlobal())) {
          return auth.isBuilder() && auth.canWrite([this.acl()]);
        }

        return auth.canWrite([this.acl()]);

      case "public":
        return auth.canWrite([this.acl()]);

      default:
        assertNever(this.kind);
    }
  }

  // Ensure thorough testing when modifying this method, as it is crucial for
  // the integrity of the permissions system. It acts as the gatekeeper,
  // determining who has the right to read resources from a vault.
  canRead(auth: Authenticator) {
    switch (this.kind) {
      case "global":
      case "system":
        return auth.canRead([this.acl()]);

      case "regular":
        return auth.canRead([this.acl()]);

      case "public":
        return true;

      default:
        assertNever(this.kind);
    }
  }

  canList(auth: Authenticator) {
    const isWorkspaceAdmin =
      auth.isAdmin() && auth.getNonNullableWorkspace().id === this.workspaceId;

    switch (this.kind) {
      case "global":
        return auth.canRead([this.acl()]);

      // Public vaults can be listed by anyone.
      case "public":
        return true;

      case "regular":
        return isWorkspaceAdmin || auth.canRead([this.acl()]);

      case "system":
        return isWorkspaceAdmin;

      default:
        assertNever(this.kind);
    }
  }

  isGlobal() {
    return this.kind === "global";
  }

  isSystem() {
    return this.kind === "system";
  }

  isRegular() {
    return this.kind === "regular";
  }

  isPublic() {
    return this.kind === "public";
  }

  isDeleted() {
    return this.deletedAt !== null;
  }

  // Serialization.

  toJSON(): SpaceType {
    return {
      groupIds: this.groups.map((group) => group.sId),
      isRestricted: !this.groups.some((group) => group.isGlobal()),
      kind: this.kind,
      name: this.name,
      sId: this.sId,
    };
  }

  toPokeJSON(): PokeSpaceType {
    return {
      ...this.toJSON(),
      groups: this.groups.map((group) => group.toJSON()),
    };
  }
}
