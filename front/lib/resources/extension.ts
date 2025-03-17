import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { ExtensionConfigurationModel } from "@app/lib/models/extension";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ExtensionConfigurationType, ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface ExtensionConfigurationResource
  extends ReadonlyAttributesType<ExtensionConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ExtensionConfigurationResource extends BaseResource<ExtensionConfigurationModel> {
  static model: ModelStatic<ExtensionConfigurationModel> =
    ExtensionConfigurationModel;

  constructor(
    model: ModelStatic<ExtensionConfigurationModel>,
    blob: Attributes<ExtensionConfigurationModel>
  ) {
    super(ExtensionConfigurationModel, blob);
  }

  get sId(): string {
    return ExtensionConfigurationResource.modelIdToSId({
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
    return makeSId("extension", {
      id,
      workspaceId,
    });
  }

  static async makeNew(
    blob: Omit<CreationAttributes<ExtensionConfigurationModel>, "workspaceId">,
    workspaceId: ModelId
  ) {
    const config = await ExtensionConfigurationModel.create({
      ...blob,
      workspaceId,
    });

    return new this(ExtensionConfigurationModel, config.get());
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
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

  static async deleteForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    try {
      await ExtensionConfigurationModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  static async fetchForWorkspace(
    auth: Authenticator
  ): Promise<ExtensionConfigurationResource | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const config = await this.model.findOne({
      where: {
        workspaceId,
      },
    });

    return config ? new this(ExtensionConfigurationModel, config.get()) : null;
  }

  static async internalFetchForWorkspaces(
    workspaceIds: ModelId[]
  ): Promise<ExtensionConfigurationResource[]> {
    const configs = await this.model.findAll({
      where: {
        workspaceId: workspaceIds,
      },
    });

    return configs.map(
      (config) => new this(ExtensionConfigurationModel, config.get())
    );
  }

  async updateBlacklistedDomains(
    auth: Authenticator,
    {
      blacklistedDomains,
    }: {
      blacklistedDomains: string[];
    }
  ) {
    if (this.workspaceId !== auth.getNonNullableWorkspace().id) {
      throw new Error(
        "Can't update extension configuration for another workspace."
      );
    }

    await this.update({
      blacklistedDomains,
    });
  }

  toJSON(): ExtensionConfigurationType {
    return {
      id: this.id,
      sId: this.sId,
      blacklistedDomains: this.blacklistedDomains,
    };
  }
}
