import type { ACLType, ModelId, Result, VaultType } from "@dust-tt/types";
import { assertNever, Ok } from "@dust-tt/types";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  Includeable,
  ModelStatic,
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
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface VaultResource extends ReadonlyAttributesType<VaultModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class VaultResource extends BaseResource<VaultModel> {
  static model: ModelStatic<VaultModel> = VaultModel;

  constructor(
    model: ModelStatic<VaultModel>,
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
    { includes, limit, order, where }: ResourceFindOptions<VaultModel> = {}
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
    sId: string
  ): Promise<VaultResource | null> {
    const vaultModelId = getResourceIdFromSId(sId);
    if (!vaultModelId) {
      return null;
    }

    const [vault] = await this.baseFetch(auth, { where: { id: vaultModelId } });

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
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    await GroupVaultModel.destroy({
      where: {
        vaultId: this.id,
      },
      transaction,
    });

    await this.model.destroy({
      where: {
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  static async deleteAllForWorkspace(
    auth: Authenticator,
    transaction?: Transaction
  ) {
    const owner = auth.getNonNullableWorkspace();
    await this.model.destroy({
      where: {
        workspaceId: owner.id,
      },
      transaction,
    });
  }

  static async deleteAllForWorkspaceExceptDefaults(auth: Authenticator) {
    const owner = auth.getNonNullableWorkspace();
    await this.model.destroy({
      where: {
        workspaceId: owner.id,
        kind: {
          [Op.notIn]: ["system", "global"],
        },
      },
    });
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

    if (this.isRegular() && !isPrivateVaultsEnabled) {
      return false;
    }

    // Admins can list all vaults.
    if (auth.isAdmin()) {
      return true;
    }

    // Public vaults can be listed by anyone.
    if (this.isPublic()) {
      return true;
    }

    return auth.canRead([this.acl()]);
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

  toJSON(): VaultType {
    return {
      sId: this.sId,
      name: this.name,
      kind: this.kind,
      groupIds: this.groups.map((group) => group.sId),
    };
  }
}
