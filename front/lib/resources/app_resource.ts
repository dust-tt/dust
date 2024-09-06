import type { AppType, AppVisibility, Project, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { DatasetResource } from "@app/lib/resources/dataset_resource";
import { ResourceWithVault } from "@app/lib/resources/resource_with_vault";
import { RunResource } from "@app/lib/resources/run_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { App, Clone } from "@app/lib/resources/storage/models/apps";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { VaultResource } from "@app/lib/resources/vault_resource";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AppResource extends ReadonlyAttributesType<App> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AppResource extends ResourceWithVault<App> {
  static model: ModelStatic<App> = App;

  private datasets: DatasetResource[];

  constructor(
    model: ModelStatic<App>,
    blob: Attributes<App>,
    vault: VaultResource,
    datasets: DatasetResource[]
  ) {
    super(AppResource.model, blob, vault);
    this.datasets = datasets;
  }

  static async makeNew(
    blob: Omit<CreationAttributes<App>, "vaultId">,
    vault: VaultResource
  ) {
    const app = await App.create({
      ...blob,
      vaultId: vault.id,
    });

    return new this(AppResource.model, app.get(), vault, []);
  }

  // Cloning.

  async clone({
    targetAuth,
    name,
    description,
    visibility,
    coreProject,
  }: {
    targetAuth: Authenticator;
    name: string;
    description: string | null;
    visibility: AppVisibility;
    coreProject: Project;
  }) {
    // TODO: still WIP
    const targetGlobalVault =
      await VaultResource.fetchWorkspaceGlobalVault(targetAuth);

    const cloned = AppResource.makeNew(
      {
        sId: generateLegacyModelSId(),
        name,
        description,
        visibility,
        dustAPIProjectId: coreProject.project_id.toString(),
        savedSpecification: this.savedSpecification,
        workspaceId: targetAuth.getNonNullableWorkspace().id,
      },
      targetGlobalVault
    );

    return cloned;
  }

  // Deletion.

  // TODO: not yet used
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
        await Promise.all(this.datasets.map((d) => d.delete(auth, t)));
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
    };
  }
}
