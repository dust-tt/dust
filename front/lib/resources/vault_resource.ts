import type { ACLType, ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface VaultResource extends ReadonlyAttributesType<VaultModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class VaultResource extends BaseResource<VaultModel> {
  static model: ModelStatic<VaultModel> = VaultModel;

  constructor(model: ModelStatic<VaultModel>, blob: Attributes<VaultModel>) {
    super(VaultModel, blob);
  }

  static async makeNew(blob: CreationAttributes<VaultModel>) {
    const group = await VaultModel.create(blob);

    return new this(VaultModel, group.get());
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
    return makeSId("group", {
      id,
      workspaceId,
    });
  }

  static async fetchWorkspaceVaults(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<VaultResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const vaults = await this.model.findAll({
      where: {
        workspaceId: owner.id,
      },
      transaction,
    });

    return vaults.map((group) => new this(VaultModel, group.get()));
  }

  static async fetchWorkspaceSystemVault(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<VaultResource> {
    const owner = auth.getNonNullableWorkspace();
    const group = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        kind: "system",
      },
      transaction,
    });

    if (!group) {
      throw new Error("System group not found.");
    }

    return new this(VaultModel, group.get());
  }

  static async fetchWorkspaceDefaultVault(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<VaultResource> {
    const owner = auth.getNonNullableWorkspace();
    const group = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        kind: "global",
      },
      transaction,
    });

    if (!group) {
      throw new Error("Global group not found.");
    }

    return new this(VaultModel, group.get());
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<VaultResource | null> {
    const owner = auth.getNonNullableWorkspace();

    const vaultModelId = getResourceIdFromSId(sId);
    if (!vaultModelId) {
      return null;
    }

    const vault = await this.model.findOne({
      where: {
        id: vaultModelId,
        workspaceId: owner.id,
      },
    });

    if (!vault) {
      return null;
    }

    return new this(VaultModel, vault.get());
  }

  static async fetchWorkspaceVaultByName(
    auth: Authenticator,
    name: string,
    transaction?: Transaction
  ): Promise<VaultResource | null> {
    const owner = auth.getNonNullableWorkspace();

    const vault = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        name: name,
      },
      transaction,
    });

    if (!vault) {
      return null;
    }

    return new this(VaultModel, vault.get());
  }

  async delete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  acl(): ACLType {
    return {
      aclEntries: [
        {
          groupId: this.groupId,
          permissions: ["read", "write"],
        },
      ],
    };
  }
}
