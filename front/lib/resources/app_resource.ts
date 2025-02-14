import type { AppType, LightWorkspaceType, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import assert from "assert";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DatasetResource } from "@app/lib/resources/dataset_resource";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import { RunResource } from "@app/lib/resources/run_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { AppModel, Clone } from "@app/lib/resources/storage/models/apps";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AppResource extends ReadonlyAttributesType<AppModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AppResource extends ResourceWithSpace<AppModel> {
  static model: ModelStatic<AppModel> = AppModel;

  constructor(
    model: ModelStatic<AppModel>,
    blob: Attributes<AppModel>,
    space: SpaceResource
  ) {
    super(AppModel, blob, space);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<AppModel>, "vaultId">,
    space: SpaceResource
  ) {
    const app = await AppModel.create({
      ...blob,
      vaultId: space.id,
      visibility: "private",
    });

    return new this(AppModel, app.get(), space);
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

  static async listByWorkspace(
    auth: Authenticator,
    options?: { includeDeleted: boolean }
  ) {
    return this.baseFetch(auth, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      includeDeleted: options?.includeDeleted,
    });
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource,
    { includeDeleted }: { includeDeleted?: boolean } = {}
  ) {
    return this.baseFetch(auth, {
      where: {
        vaultId: space.id,
      },
      includeDeleted,
    });
  }

  // Clone.

  async clone(
    auth: Authenticator,
    targetWorkspace: LightWorkspaceType,
    targetSpace: SpaceResource,
    {
      dustAPIProjectId,
    }: {
      dustAPIProjectId: string;
    }
  ): Promise<Result<AppResource, Error>> {
    // Only dust super users can clone apps. Authenticator has no write permissions
    // on the target workspace.
    if (!auth.isDustSuperUser()) {
      throw new Error("Only dust super users can clone apps");
    }

    if (targetWorkspace.id !== targetSpace.workspaceId) {
      return new Err(new Error("Target space must belong to target workspace"));
    }

    // Create new app in target workspace.
    const newApp = await AppResource.makeNew(
      {
        description: this.description,
        dustAPIProjectId,
        name: this.name,
        savedConfig: this.savedConfig,
        savedSpecification: this.savedSpecification,
        sId: generateRandomModelSId(),
        visibility: "private",
        workspaceId: targetWorkspace.id,
      },
      targetSpace
    );

    // Copy datasets.
    const datasets = await DatasetResource.listForApp(auth, this);

    for (const dataset of datasets) {
      await DatasetResource.makeNew(
        {
          description: dataset.description,
          name: dataset.name,
          schema: dataset.schema,
          workspaceId: newApp.workspaceId,
        },
        newApp
      );
    }

    // Create clone relationship.
    await Clone.create({
      fromId: this.id,
      toId: newApp.id,
      workspaceId: newApp.workspaceId,
    });

    return new Ok(newApp);
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
      space: this.space.toJSON(),
    };
  }
}
