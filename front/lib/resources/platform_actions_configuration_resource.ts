import type {
  PlatformActionsConfigurationType,
  PlatformActionsProviderType,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { CreationAttributes } from "sequelize";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { PlatformActionsConfigurationModel } from "@app/lib/resources/storage/models/platform_actions";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PlatformActionsConfigurationResource
  extends ReadonlyAttributesType<PlatformActionsConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PlatformActionsConfigurationResource extends BaseResource<PlatformActionsConfigurationModel> {
  static model: ModelStatic<PlatformActionsConfigurationModel> =
    PlatformActionsConfigurationModel;

  constructor(
    model: ModelStatic<PlatformActionsConfigurationModel>,
    blob: Attributes<PlatformActionsConfigurationModel>
  ) {
    super(PlatformActionsConfigurationModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<PlatformActionsConfigurationModel>
  ): Promise<PlatformActionsConfigurationResource> {
    const configuration = await PlatformActionsConfigurationModel.create({
      ...blob,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    return new PlatformActionsConfigurationResource(
      PlatformActionsConfigurationModel,
      configuration.get()
    );
  }

  static async findByWorkspaceAndProvider(
    auth: Authenticator,
    {
      provider,
    }: {
      provider: PlatformActionsProviderType;
    }
  ): Promise<PlatformActionsConfigurationResource | null> {
    const owner = auth.workspace();

    if (!owner) {
      return null;
    }

    const configuration = await PlatformActionsConfigurationModel.findOne({
      where: {
        workspaceId: owner.id,
        provider,
      },
    });

    return configuration
      ? new PlatformActionsConfigurationResource(
          PlatformActionsConfigurationModel,
          configuration.get()
        )
      : null;
  }

  static async listByWorkspace(
    auth: Authenticator
  ): Promise<PlatformActionsConfigurationResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const configurations = await PlatformActionsConfigurationModel.findAll({
      where: {
        workspaceId: owner.id,
      },
    });

    return configurations.map(
      (configuration) =>
        new PlatformActionsConfigurationResource(
          PlatformActionsConfigurationModel,
          configuration.get()
        )
    );
  }

  async updateConnection(
    auth: Authenticator,
    { connectionId }: { connectionId: string }
  ): Promise<void> {
    if (auth.isAdmin()) {
      await this.update({
        connectionId,
      });
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    if (!auth.isAdmin()) {
      return new Err(
        new Error("Only admins can delete platform actions configurations")
      );
    }
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

  toJSON(): PlatformActionsConfigurationType {
    return {
      connectionId: this.connectionId,
      provider: this.provider,
    };
  }
}
