import type {
  ACLType,
  ModelId,
  PokeVaultType,
  Result,
  VaultType,
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
    group: GroupResource
  ) {
    return frontSequelize.transaction(async (transaction) => {
      const vault = await VaultModel.create(blob, { transaction });
      await GroupVaultModel.create(
        {
          groupId: group.id,
          vaultId: vault.id,
        },
        { transaction }
      );

      return new this(VaultModel, vault.get(), [group]);
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
        systemGroup
      ));

    const globalVault =
      existingVaults.find((v) => v.kind === "global") ||
      (await VaultResource.makeNew(
        {
          name: "Company Data",
          kind: "global",
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        globalGroup
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

  acl(): ACLType {
    return {
      aclEntries: this.groups.map((group) => ({
        groupId: group.id,
        permissions: ["read", "write"],
      })),
    };
  }

  canWrite(auth: Authenticator) {
    const isPrivateVaultsEnabled = auth
      .getNonNullableWorkspace()
      .flags.includes("private_data_vaults_feature");

    switch (this.kind) {
      case "system":
        return auth.isAdmin() && auth.canWrite([this.acl()]);

      case "global":
        return auth.isBuilder() && auth.canWrite([this.acl()]);

      case "regular":
        return isPrivateVaultsEnabled ? auth.canWrite([this.acl()]) : false;

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
    const isPrivateVaultsEnabled = auth
      .getNonNullableWorkspace()
      .flags.includes("private_data_vaults_feature");

    switch (this.kind) {
      case "global":
      case "system":
        return auth.canRead([this.acl()]);

      case "regular":
        return isPrivateVaultsEnabled ? auth.canRead([this.acl()]) : false;

      case "public":
        return true;

      default:
        assertNever(this.kind);
    }
  }

  canList(auth: Authenticator) {
    const isPrivateVaultsEnabled = auth
      .getNonNullableWorkspace()
      .flags.includes("private_data_vaults_feature");

    const isWorkspaceAdmin =
      auth.isAdmin() && auth.getNonNullableWorkspace().id === this.workspaceId;

    switch (this.kind) {
      case "global":
        return auth.canRead([this.acl()]);

      // Public vaults can be listed by anyone.
      case "public":
        return true;

      case "regular":
        return isPrivateVaultsEnabled
          ? isWorkspaceAdmin || auth.canRead([this.acl()])
          : false;

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

  // Seriliazation.

  toJSON(): VaultType {
    return {
      sId: this.sId,
      name: this.name,
      kind: this.kind,
      groupIds: this.groups.map((group) => group.sId),
    };
  }

  toPokeJSON(): PokeVaultType {
    return {
      ...this.toJSON(),
      groups: this.groups.map((group) => group.toJSON()),
    };
  }
}
