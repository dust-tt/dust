import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { GongUserModel } from "@connectors/lib/models/gong";
import { GongConfigurationModel } from "@connectors/lib/models/gong";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ConnectorResource } from "@connectors/resources/connector_resource"; // Attributes are marked as read-only to reflect the stateless nature of our Resource.
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GongConfigurationResource
  extends ReadonlyAttributesType<GongConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GongConfigurationResource extends BaseResource<GongConfigurationModel> {
  static model: ModelStatic<GongConfigurationModel> = GongConfigurationModel;

  constructor(
    model: ModelStatic<GongConfigurationModel>,
    blob: Attributes<GongConfigurationModel>
  ) {
    super(GongConfigurationModel, blob);
  }

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<GongConfigurationModel>;
    transaction?: Transaction;
  }): Promise<GongConfigurationResource> {
    const configuration = await GongConfigurationModel.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, configuration.get());
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastSyncTimestamp: this.lastSyncTimestamp,
    };
  }

  static async fetchByConnector(
    connector: ConnectorResource
  ): Promise<GongConfigurationResource | null> {
    const configuration = await GongConfigurationModel.findOne({
      where: { connectorId: connector.id },
    });
    return configuration && new this(this.model, configuration.get());
  }

  async resetLastSyncTimestamp(): Promise<void> {
    await this.update({ lastSyncTimestamp: null });
  }

  async setLastSyncTimestamp(timestamp: number): Promise<void> {
    await this.update({ lastSyncTimestamp: timestamp });
  }
}

export type GongUserBlob = Omit<
  CreationAttributes<GongUserModel>,
  "connectorId" | "id"
>;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GongUserResource
  extends ReadonlyAttributesType<GongUserModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GongUserResource extends BaseResource<GongUserModel> {
  static model: ModelStatic<GongUserModel> = GongUserModel;

  constructor(
    model: ModelStatic<GongUserModel>,
    blob: Attributes<GongUserModel>
  ) {
    super(GongUserModel, blob);
  }

  static async makeNew(
    connector: ConnectorResource,
    blob: GongUserBlob,
    transaction?: Transaction
  ): Promise<GongUserResource> {
    const user = await GongUserModel.create(
      { ...blob },
      transaction && { transaction }
    );

    return new this(this.model, user.get());
  }

  static async batchCreate(
    connector: ConnectorResource,
    usersBlobs: GongUserBlob[]
  ): Promise<GongUserResource[]> {
    const users = await GongUserModel.bulkCreate(
      usersBlobs.map((user) => ({
        ...user,
        connectorId: connector.id,
      }))
    );

    return users.map((user) => new this(this.model, user.get()));
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          connectorId: this.connectorId,
        },
        transaction,
      });
    } catch (error) {
      return new Err(error as Error);
    }

    return new Ok(undefined);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  toJSON(): Record<string, unknown> {
    return {
      createdAt: this.createdAt,
      email: this.email,
      emailAliases: this.emailAliases,
      firstName: this.firstName,
      gongId: this.gongId,
      id: this.id,
      lastName: this.lastName,
      updatedAt: this.updatedAt,
    };
  }

  static async listByConnector(
    connector: ConnectorResource
  ): Promise<GongUserResource[]> {
    const users = await GongUserModel.findAll({
      where: { connectorId: connector.id },
    });

    return users.map((user) => new this(this.model, user.get()));
  }

  static async fetchByGongId(
    connector: ConnectorResource,
    { gongId }: { gongId: string }
  ): Promise<GongUserResource | null> {
    const user = await GongUserModel.findOne({
      where: { connectorId: connector.id, gongId },
    });

    if (!user) {
      return null;
    }

    return new this(this.model, user.get());
  }
}
