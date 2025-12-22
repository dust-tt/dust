import type { Result } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import {
  SalesforceConfigurationModel,
  SalesforceSyncedQueryModel,
} from "@connectors/lib/models/salesforce";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types"; // Attributes are marked as read-only to reflect the stateless nature of our Resource.
import type { ModelId } from "@connectors/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
 
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SalesforceConfigurationResource
  extends ReadonlyAttributesType<SalesforceConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SalesforceConfigurationResource extends BaseResource<SalesforceConfigurationModel> {
  static model: ModelStatic<SalesforceConfigurationModel> =
    SalesforceConfigurationModel;

  constructor(
    model: ModelStatic<SalesforceConfigurationModel>,
    blob: Attributes<SalesforceConfigurationModel>
  ) {
    super(SalesforceConfigurationModel, blob);
  }

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<SalesforceConfigurationModel>;
    transaction?: Transaction;
  }): Promise<SalesforceConfigurationResource> {
    const configuration = await SalesforceConfigurationModel.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, configuration.get());
  }

  static async fetchByConnectorId(
    connectorId: number
  ): Promise<SalesforceConfigurationResource | null> {
    const configuration = await SalesforceConfigurationModel.findOne({
      where: { connectorId },
    });
    return configuration && new this(this.model, configuration.get());
  }

  static async fetchByConnectorIds(
    connectorIds: ModelId[]
  ): Promise<Record<ModelId, SalesforceConfigurationResource>> {
    const blobs = await this.model.findAll({
      where: {
        connectorId: connectorIds,
      },
    });

    return blobs.reduce(
      (acc, blob) => {
        acc[blob.connectorId] = new this(this.model, blob.get());
        return acc;
      },
      {} as Record<ModelId, SalesforceConfigurationResource>
    );
  }

  static async deleteByConnectorId(
    connectorId: number,
    transaction?: Transaction
  ): Promise<void> {
    await this.model.destroy({ where: { connectorId }, transaction });
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
      connectorId: this.connectorId,
    };
  }
}

 
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SalesforceSyncedQueryResource
  extends ReadonlyAttributesType<SalesforceSyncedQueryModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SalesforceSyncedQueryResource extends BaseResource<SalesforceSyncedQueryModel> {
  static model: ModelStatic<SalesforceSyncedQueryModel> =
    SalesforceSyncedQueryModel;

  constructor(
    model: ModelStatic<SalesforceSyncedQueryModel>,
    blob: Attributes<SalesforceSyncedQueryModel>
  ) {
    super(SalesforceSyncedQueryModel, blob);
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { connectorId: this.connectorId, id: this.id },
      transaction,
    });
    return new Ok(undefined);
  }

  static async deleteByConnectorId(
    connectorId: ModelId,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { connectorId },
      transaction,
    });
    return new Ok(undefined);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,

      rootNodeName: this.rootNodeName,
      soql: this.soql,
      lastSeenModifiedDate: this.lastSeenModifiedDate,
      titleTemplate: this.titleTemplate,
      contentTemplate: this.contentTemplate,
      tagsTemplate: this.tagsTemplate,

      connectorId: this.connectorId,
    };
  }

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: CreationAttributes<SalesforceSyncedQueryModel>;
    transaction?: Transaction;
  }): Promise<SalesforceSyncedQueryResource> {
    const brand = await SalesforceSyncedQueryModel.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, brand.get());
  }

  static async fetchByConnector(
    connector: ConnectorResource
  ): Promise<SalesforceSyncedQueryResource[]> {
    const syncedQueries = await SalesforceSyncedQueryModel.findAll({
      where: { connectorId: connector.id },
    });
    return syncedQueries.map((brand) => new this(this.model, brand.get()));
  }

  async updateLastSeenModifiedAt(lastSeenModifiedDate: Date | null) {
    await this.update({
      lastSeenModifiedDate,
    });
  }
}
