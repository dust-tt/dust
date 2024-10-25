import type {
  ModelId,
  PokeVaultType,
  ResourcePermission,
  Result,
  VaultType,
} from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
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
import { GroupVaultModel } from "@app/lib/resources/storage/models/group_vaults";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticSoftDeletable } from "@app/lib/resources/storage/wrappers";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface VaultResource extends ReadonlyAttributesType<VaultModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class VaultResource extends BaseResource<VaultModel> {
  static model: ModelStaticSoftDeletable<VaultModel> = VaultModel;

  constructor(
    model: ModelStaticSoftDeletable<VaultModel>,
    blob: Attributes<VaultModel>,
    readonly groups: GroupResource[]
  ) {
    super(VaultModel, blob);
  }

  static fromModel(vault: VaultModel) {
    return new VaultResource(
      VaultModel,
      vault.get(),
      vault.groups.map((group) => new GroupResource(GroupModel, group.get()))
    );
  }

  static async makeNew(
    blob: CreationAttributes<VaultModel>,
    groups: GroupResource[]
  ) {
    return frontSequelize.transaction(async (transaction) => {
      const vault = await VaultModel.create(blob, { transaction });

      for (const group of groups) {
        await GroupVaultModel.create(
          {
            groupId: group.id,
            vaultId: vault.id,
          },
          { transaction }
        );
      }

      return new this(VaultModel, vault.get(), groups);
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

    const existingVaults = await this.listWorkspaceDefaultVaults(auth);
    const systemVault =
      existingVaults.find((v) => v.kind === "system") ||
      (await VaultResource.makeNew(
        {
          name: "System",
          kind: "system",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        [systemGroup]
      ));

    const globalVault =
      existingVaults.find((v) => v.kind === "global") ||
      (await VaultResource.makeNew(
        {
          name: "Company Data",
          kind: "global",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        [globalGroup]
      ));

    return {
      systemVault,
      globalVault,
    };
  }

  get sId(): string {
    return VaultResource.modelIdToSId({
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
    }: ResourceFindOptions<VaultModel> = {}
  ) {
    const includeClauses: Includeable[] = [
      {
        model: GroupResource.model,
      },
      ...(includes || []),
    ];

    const vaultModels = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<VaultModel>,
      include: includeClauses,
      limit,
      order,
      includeDeleted,
    });

    return vaultModels.map(this.fromModel);
  }

  static async listWorkspaceVaults(
    auth: Authenticator
  ): Promise<VaultResource[]> {
    const vaults = await this.baseFetch(auth);

    return vaults.filter((vault) => vault.canList(auth));
  }

  static async listWorkspaceVaultsAsMember(auth: Authenticator) {
    const vaults = await this.baseFetch(auth);
    // using canRead() as we know that only members can read vaults (but admins can list them)
    return vaults.filter((vault) => vault.canList(auth) && vault.canRead(auth));
  }

  static async listWorkspaceDefaultVaults(auth: Authenticator) {
    return this.baseFetch(auth, {
      where: {
        kind: {
          [Op.in]: ["system", "global"],
        },
      },
    });
  }

  static async listForGroups(auth: Authenticator, groups: GroupResource[]) {
    const groupVaults = await GroupVaultModel.findAll({
      where: {
        groupId: groups.map((g) => g.id),
      },
    });

    const vaults = await this.baseFetch(auth, {
      where: {
        id: groupVaults.map((v) => v.vaultId),
      },
    });

    return vaults.filter((v) => v.canRead(auth));
  }

  static async fetchWorkspaceSystemVault(
    auth: Authenticator
  ): Promise<VaultResource> {
    const [vault] = await this.baseFetch(auth, { where: { kind: "system" } });

    if (!vault) {
      throw new Error("System vault not found.");
    }

    return vault;
  }

  static async fetchWorkspaceGlobalVault(
    auth: Authenticator
  ): Promise<VaultResource> {
    const [vault] = await this.baseFetch(auth, { where: { kind: "global" } });

    if (!vault) {
      throw new Error("Global vault not found.");
    }

    return vault;
  }

  static async fetchById(
    auth: Authenticator,
    sId: string,
    { includeDeleted }: { includeDeleted?: boolean } = {}
  ): Promise<VaultResource | null> {
    const vaultModelId = getResourceIdFromSId(sId);
    if (!vaultModelId) {
      return null;
    }

    const [vault] = await this.baseFetch(auth, {
      where: { id: vaultModelId },
      includeDeleted,
    });

    return vault;
  }

  static async isNameAvailable(
    auth: Authenticator,
    name: string
  ): Promise<boolean> {
    const owner = auth.getNonNullableWorkspace();

    const vault = await this.model.findOne({
      where: {
        name,
        workspaceId: owner.id,
      },
    });

    return !vault;
  }

  async delete(
    auth: Authenticator,
    options: { hardDelete: boolean; transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    const { hardDelete, transaction } = options;

    await GroupVaultModel.destroy({
      where: {
        vaultId: this.id,
      },
      transaction,
    });

    await VaultModel.destroy({
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
      return new Err(new Error("Only admins can update vault names."));
    }

    const nameAvailable = await VaultResource.isNameAvailable(auth, newName);
    if (!nameAvailable) {
      return new Err(new Error("This vault name is already used."));
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
          "You do not have permission to update vault permissions."
        )
      );
    }

    const regularGroups = this.groups.filter(
      (group) => group.kind === "regular"
    );

    // Ensure exactly one regular group is associated with the vault.
    // IMPORTANT: This constraint is critical for the requestedPermissions() method logic.
    // Modifying this requires careful review and updates to requestedPermissions().
    assert(
      regularGroups.length === 1,
      `Expected exactly one regular group for the vault, but found ${regularGroups.length}.`
    );
    const [defaultVaultGroup] = regularGroups;

    const wasRestricted = this.groups.every((g) => !g.isGlobal());

    const groupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (groupRes.isErr()) {
      return groupRes;
    }

    const globalGroup = groupRes.value;
    if (isRestricted) {
      // If the vault should be restricted and was not restricted before, remove the global group.
      if (!wasRestricted) {
        await this.removeGroup(globalGroup);
      }

      if (memberIds) {
        const users = await UserResource.fetchByIds(memberIds);

        return defaultVaultGroup.setMembers(
          auth,
          users.map((u) => u.toJSON())
        );
      }

      return new Ok(undefined);
    } else {
      // If the vault should not be restricted and was restricted before, add the global group.
      if (wasRestricted) {
        await this.addGroup(globalGroup);
      }

      // Remove all members.
      await defaultVaultGroup.setMembers(auth, []);

      return new Ok(undefined);
    }
  }

  private async addGroup(group: GroupResource) {
    await GroupVaultModel.create({
      groupId: group.id,
      vaultId: this.id,
    });
  }

  private async removeGroup(group: GroupResource) {
    await GroupVaultModel.destroy({
      where: {
        groupId: group.id,
        vaultId: this.id,
      },
    });
  }

  /**
   * Computes resource permissions based on vault type and group configuration.
   *
   * Permission patterns by vault type:
   *
   * 1. System vaults:
   * - Restricted to workspace admins only
   *
   * 2. Public vaults:
   * - Read: Anyone
   * - Write: Workspace admins and builders
   *
   * 3. Global vaults:
   * - Read: All workspace members
   * - Write: Workspace admins and builders
   *
   * 4. Open vaults:
   * - Read: All workspace members
   * - Write: Admins and builders
   *
   * 5. Restricted vaults:
   * - Read/Write: Group members
   * - Admin: Workspace admins
   *
   * @returns Array of ResourcePermission objects based on vault type
   */
  requestedPermissions(): ResourcePermission[] {
    const globalGroup = this.isRegular()
      ? this.groups.find((group) => group.isGlobal())
      : undefined;

    // System vaults.
    if (this.isSystem()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [{ role: "admin", permissions: ["admin", "write"] }],
          groups: [],
        },
      ];
    }

    // Public vaults.
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

    // Default Workspace vault.
    if (this.isGlobal()) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [
            { role: "admin", permissions: ["read", "write"] },
            { role: "builder", permissions: ["read", "write"] },
          ],
          groups: this.groups.map((group) => ({
            id: group.id,
            permissions: ["read"],
          })),
        },
      ];
    }

    // Open vaults:
    // Currently only using global group for simplicity
    // TODO(2024-10-25 flav): Refactor to store a list of ResourcePermission on conversations
    // and agent_configurations. This will allow proper handling of multiple groups instead
    // of only using the global group as a temporary solution.
    if (globalGroup) {
      return [
        {
          workspaceId: this.workspaceId,
          roles: [
            { role: "admin", permissions: ["admin", "read", "write"] },
            { role: "builder", permissions: ["read", "write"] },
            { role: "user", permissions: ["read"] },
          ],
          // Temporary: Only using global group until we implement multi-group support
          groups: [
            {
              id: globalGroup.id,
              permissions: ["read"],
            },
          ],
        },
      ];
    }

    // Restricted vaults.
    return [
      {
        workspaceId: this.workspaceId,
        roles: [{ role: "admin", permissions: ["admin"] }],
        groups: this.groups.map((group) => ({
          id: group.id,
          permissions: ["read", "write"],
        })),
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

  canList(auth: Authenticator) {
    return this.canRead(auth) || this.canAdministrate(auth);
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

  toJSON(): VaultType {
    return {
      groupIds: this.groups.map((group) => group.sId),
      isRestricted: !this.groups.some((group) => group.isGlobal()),
      kind: this.kind,
      name: this.name,
      sId: this.sId,
    };
  }

  toPokeJSON(): PokeVaultType {
    return {
      ...this.toJSON(),
      groups: this.groups.map((group) => group.toJSON()),
    };
  }
}
