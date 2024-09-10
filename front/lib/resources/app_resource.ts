import type { AppType, AppVisibility, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import assert from "assert";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DatasetResource } from "@app/lib/resources/dataset_resource";
import { ResourceWithVault } from "@app/lib/resources/resource_with_vault";
import { RunResource } from "@app/lib/resources/run_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { App, Clone } from "@app/lib/resources/storage/models/apps";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { VaultResource } from "@app/lib/resources/vault_resource";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AppResource extends ReadonlyAttributesType<App> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AppResource extends ResourceWithVault<App> {
  static model: ModelStatic<App> = App;

  constructor(
    model: ModelStatic<App>,
    blob: Attributes<App>,
    vault: VaultResource
  ) {
    super(App, blob, vault);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<App>, "vaultId">,
    vault: VaultResource
  ) {
    const app = await App.create({
      ...blob,
      vaultId: vault.id,
    });

    return new this(App, app.get(), vault);
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<App>
  ) {
    const apps = await this.baseFetchWithAuthorization(auth, {
      ...options,
    });

    return apps.filter((app) => auth.isAdmin() || app.canRead(auth));
  }

  // fetchByIds filters out private apps if the auth is not a user on the workspace. This will be
  // removed soon as we remove public apps.
  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<AppResource[]> {
    return this.baseFetch(auth, {
      where: {
        sId: ids,
        visibility: auth.isUser() ? ["public", "private"] : ["public"],
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

  // listByWorkspace filters out private apps if the auth is not a user on the workspace. This will
  // be removed soon as we remove public apps.
  static async listByWorkspace(auth: Authenticator) {
    return this.baseFetch(auth, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        visibility: auth.isUser() ? ["public", "private"] : ["public"],
      },
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
      visibility,
    }: {
      name: string;
      description: string | null;
      visibility: AppVisibility;
    }
  ) {
    assert(this.canWrite(auth), "Unauthorized write attempt");
    await this.update({
      name,
      description,
      visibility,
    });
  }

  async markAsDeleted(auth: Authenticator) {
    assert(this.canWrite(auth), "Unauthorized write attempt");
    await this.update({
      visibility: "deleted",
    });
  }

  // Deletion.

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    try {
      await frontSequelize.transaction(async (t) => {
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
        await this.model.destroy({
          where: {
            workspaceId: auth.getNonNullableWorkspace().id,
            id: this.id,
          },
          transaction: t,
        });
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  // Serialization.

  toJSON(): AppType {
    return {
      id: this.id,
      sId: this.sId,
      name: this.name,
      description: this.description,
      visibility: this.visibility,
      savedSpecification: this.savedSpecification,
      savedConfig: this.savedConfig,
      savedRun: this.savedRun,
      dustAPIProjectId: this.dustAPIProjectId,
      vault: this.vault.toJSON(),
    };
  }
}
