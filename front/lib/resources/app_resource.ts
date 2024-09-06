import type { AppType, Result } from "@dust-tt/types";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";

import { ResourceWithVault } from "@app/lib/resources/resource_with_vault";
import { App } from "@app/lib/resources/storage/models/apps";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
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
    super(AppResource.model, blob, vault);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<App>, "vaultId">,
    vault: VaultResource
  ) {
    const app = await App.create({
      ...blob,
      vaultId: vault.id,
    });

    return new this(AppResource.model, app.get(), vault);
  }

  async delete(): Promise<Result<undefined, Error>> {
    // We never delete apps for now.
    throw new Error("Apps deletion is not supported yet.");
  }

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
