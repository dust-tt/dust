import type { AppType, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import assert from "assert";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DatasetResource } from "@app/lib/resources/dataset_resource";
import { ResourceWithVault } from "@app/lib/resources/resource_with_vault";
import { RunResource } from "@app/lib/resources/run_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { AppModel, Clone } from "@app/lib/resources/storage/models/apps";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { VaultResource } from "@app/lib/resources/vault_resource";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AppResource extends ReadonlyAttributesType<AppModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AppResource extends ResourceWithVault<AppModel> {
  static model: ModelStatic<AppModel> = AppModel;

  constructor(
    model: ModelStatic<AppModel>,
    blob: Attributes<AppModel>,
    vault: VaultResource
  ) {
    super(AppModel, blob, vault);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<AppModel>, "vaultId">,
    vault: VaultResource
  ) {
    const app = await AppModel.create({
      ...blob,
      vaultId: vault.id,
      visibility: "private",
    });

    return new this(AppModel, app.get(), vault);
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<AppModel>
  ) {
    const apps = await this.baseFetchWithAuthorization(auth, {
      ...options,
    });

    // This is what enforces the accessibility to an app.
    return apps.filter((app) => auth.isAdmin() || app.canRead(auth));
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<AppResource[]> {
    return this.baseFetch(auth, {
      where: {
        sId: ids,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<AppResource | null> {
    const [app] = await this.fetchByIds(auth, [id]);

    return app ?? null;
  }

  static async listByWorkspace(auth: Authenticator) {
    return this.baseFetch(auth, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  static async listByVault(
    auth: Authenticator,
    vault: VaultResource,
    { includeDeleted }: { includeDeleted?: boolean } = {}
  ) {
    return this.baseFetch(auth, {
      where: {
        vaultId: vault.id,
      },
      includeDeleted,
    });
  }

  // Mutation.

  async updateState(
    auth: Authenticator,
    {
      savedSpecification,
      savedConfig,
      savedRun,
    }: {
      savedSpecification: string;
      savedConfig: string;
      savedRun?: string;
    }
  ) {
    assert(this.canWrite(auth), "Unauthorized write attempt");
    await this.update({
      savedSpecification,
      savedConfig,
      savedRun,
    });
  }

  async updateSettings(
    auth: Authenticator,
    {
      name,
      description,
    }: {
      name: string;
      description: string | null;
    }
  ) {
    assert(this.canWrite(auth), "Unauthorized write attempt");
    await this.update({
      name,
      description,
    });
  }

  // Deletion.

  protected async hardDelete(
    auth: Authenticator
  ): Promise<Result<number, Error>> {
    const deletedCount = await frontSequelize.transaction(async (t) => {
      await RunResource.deleteAllByAppId(this.id, t);

      await Clone.destroy({
        where: {
          [Op.or]: [{ fromId: this.id }, { toId: this.id }],
        },
        transaction: t,
      });
      const res = await DatasetResource.deleteForApp(auth, this, t);
      if (res.isErr()) {
        // Interrupt the transaction if there was an error deleting datasets.
        throw res.error;
      }

      return AppModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction: t,
        // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
        // bypassing the soft deletion in place.
        hardDelete: true,
      });
    });

    return new Ok(deletedCount);
  }

  protected async softDelete(
    auth: Authenticator
  ): Promise<Result<number, Error>> {
    const deletedCount = await AppModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      hardDelete: false,
    });

    return new Ok(deletedCount);
  }

  // Serialization.

  toJSON(): AppType {
    return {
      id: this.id,
      sId: this.sId,
      name: this.name,
      description: this.description,
      savedSpecification: this.savedSpecification,
      savedConfig: this.savedConfig,
      savedRun: this.savedRun,
      dustAPIProjectId: this.dustAPIProjectId,
      vault: this.vault.toJSON(),
    };
  }
}
