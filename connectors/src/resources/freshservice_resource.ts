import type { Result } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";
import type { ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

import {
  FreshServiceConfigurationModel,
  FreshServiceTicketModel,
  FreshServiceTimestampCursorModel,
} from "@connectors/lib/models/freshservice";
import { BaseResource } from "@connectors/resources/base_resource";
import type { WithCreationAttributes } from "@connectors/resources/connector/strategy";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type { ModelId } from "@connectors/types";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FreshServiceConfigurationResource
  extends ReadonlyAttributesType<FreshServiceConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FreshServiceConfigurationResource extends BaseResource<FreshServiceConfigurationModel> {
  static model: ModelStatic<FreshServiceConfigurationModel> =
    FreshServiceConfigurationModel;

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: WithCreationAttributes<FreshServiceConfigurationModel>;
    transaction?: Transaction;
  }): Promise<FreshServiceConfigurationResource> {
    const configuration = await FreshServiceConfigurationModel.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, configuration.get());
  }

  static async fetchByConnectorId(
    connectorId: ModelId
  ): Promise<FreshServiceConfigurationResource | null> {
    const configuration = await FreshServiceConfigurationResource.model.findOne(
      {
        where: { connectorId },
      }
    );
    return configuration && new this(this.model, configuration.get());
  }

  static async deleteByConnectorId(
    connectorId: number,
    transaction: Transaction
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

      subdomain: this.subdomain,
      retentionPeriodDays: this.retentionPeriodDays,
      ticketPermission: this.ticketPermission,

      connectorId: this.connectorId,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FreshServiceTimestampCursorResource
  extends ReadonlyAttributesType<FreshServiceTimestampCursorModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FreshServiceTimestampCursorResource extends BaseResource<FreshServiceTimestampCursorModel> {
  static model: ModelStatic<FreshServiceTimestampCursorModel> =
    FreshServiceTimestampCursorModel;

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: WithCreationAttributes<FreshServiceTimestampCursorModel>;
    transaction?: Transaction;
  }): Promise<FreshServiceTimestampCursorResource> {
    const cursor = await FreshServiceTimestampCursorModel.create(
      { ...blob },
      transaction && { transaction }
    );
    return new this(this.model, cursor.get());
  }

  static async fetchByConnectorId(
    connectorId: ModelId
  ): Promise<FreshServiceTimestampCursorResource | null> {
    const cursor = await FreshServiceTimestampCursorResource.model.findOne({
      where: { connectorId },
    });
    return cursor && new this(this.model, cursor.get());
  }

  async postFetchHook(): Promise<void> {
    return Promise.resolve();
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id },
      transaction,
    });
    return new Ok(undefined);
  }

  static async deleteByConnectorId(
    connectorId: ModelId,
    transaction?: Transaction
  ): Promise<void> {
    await FreshServiceTimestampCursorModel.destroy({
      where: { connectorId },
      transaction,
    });
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      connectorId: this.connectorId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      timestampCursor: this.timestampCursor,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FreshServiceTicketResource
  extends ReadonlyAttributesType<FreshServiceTicketModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FreshServiceTicketResource extends BaseResource<FreshServiceTicketModel> {
  static model: ModelStatic<FreshServiceTicketModel> = FreshServiceTicketModel;

  static async makeNew({
    blob,
    transaction,
  }: {
    blob: WithCreationAttributes<FreshServiceTicketModel>;
    transaction?: Transaction;
  }): Promise<FreshServiceTicketResource> {
    const model = await FreshServiceTicketModel.create(blob, {
      transaction,
    });
    return new this(this.model, model.get());
  }

  static async fetchByTicketId({
    connectorId,
    ticketId,
  }: {
    connectorId: ModelId;
    ticketId: number;
  }): Promise<FreshServiceTicketResource | null> {
    const model = await FreshServiceTicketModel.findOne({
      where: { connectorId, ticketId },
    });
    if (!model) {
      return null;
    }
    return new FreshServiceTicketResource(
      FreshServiceTicketResource.model,
      model.get()
    );
  }

  static async fetchAllByConnectorId(
    connectorId: ModelId
  ): Promise<FreshServiceTicketResource[]> {
    const models = await FreshServiceTicketModel.findAll({
      where: { connectorId },
    });
    return models.map(
      (model) =>
        new FreshServiceTicketResource(
          FreshServiceTicketResource.model,
          model.get()
        )
    );
  }

  static async fetchTicketsUpdatedSince({
    connectorId,
    updatedSince,
  }: {
    connectorId: ModelId;
    updatedSince: Date;
    limit?: number;
  }): Promise<FreshServiceTicketResource[]> {
    const models = await FreshServiceTicketModel.findAll({
      where: {
        connectorId,
        ticketUpdatedAt: {
          [Op.gt]: updatedSince,
        },
      },
    });
    return models.map(
      (model) =>
        new FreshServiceTicketResource(
          FreshServiceTicketResource.model,
          model.get()
        )
    );
  }

  static async deleteByTicketId({
    connectorId,
    ticketId,
  }: {
    connectorId: ModelId;
    ticketId: number;
  }): Promise<void> {
    await FreshServiceTicketModel.destroy({
      where: { connectorId, ticketId },
    });
  }

  async postFetchHook(): Promise<void> {
    return Promise.resolve();
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      connectorId: this.connectorId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      subject: this.subject,
      url: this.url,
      ticketUpdatedAt: this.ticketUpdatedAt,
      lastUpsertedTs: this.lastUpsertedTs,
    };
  }

  static async deleteByConnectorId(
    connectorId: ModelId,
    transaction?: Transaction
  ): Promise<void> {
    await FreshServiceTicketModel.destroy({
      where: { connectorId },
      transaction,
    });
  }
}
