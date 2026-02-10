import { DustProjectConversationModel } from "@connectors/lib/models/dust_project";
import logger from "@connectors/logger/logger";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DustProjectConversationResource
  extends ReadonlyAttributesType<DustProjectConversationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DustProjectConversationResource extends BaseResource<DustProjectConversationModel> {
  static model: ModelStatic<DustProjectConversationModel> =
    DustProjectConversationModel;

  constructor(
    model: ModelStatic<DustProjectConversationModel>,
    blob: Attributes<DustProjectConversationModel>
  ) {
    super(DustProjectConversationModel, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  static async makeNew({
    connectorId,
    conversationId,
    projectId,
    sourceUpdatedAt,
    transaction,
  }: {
    connectorId: ModelId;
    conversationId: string;
    projectId: string;
    sourceUpdatedAt: Date;
    transaction?: Transaction;
  }): Promise<DustProjectConversationResource> {
    const model = await DustProjectConversationModel.create(
      {
        connectorId,
        conversationId,
        projectId,
        sourceUpdatedAt,
      },
      { transaction }
    );

    return new DustProjectConversationResource(DustProjectConversationModel, {
      ...model.get({ plain: true }),
    });
  }

  static async fetchByConnectorIdAndConversationId(
    connectorId: ModelId,
    conversationId: string
  ): Promise<DustProjectConversationResource | null> {
    const model = await DustProjectConversationModel.findOne({
      where: {
        connectorId,
        conversationId,
      },
    });

    if (!model) {
      return null;
    }

    return new DustProjectConversationResource(DustProjectConversationModel, {
      ...model.get({ plain: true }),
    });
  }

  static async fetchByConnectorId(
    connectorId: ModelId
  ): Promise<DustProjectConversationResource[]> {
    const models = await DustProjectConversationModel.findAll({
      where: {
        connectorId,
      },
    });

    return models.map(
      (model) =>
        new DustProjectConversationResource(DustProjectConversationModel, {
          ...model.get({ plain: true }),
        })
    );
  }

  async updateLastSyncedAt(
    lastSyncedAt: Date | null,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    try {
      await DustProjectConversationModel.update(
        { lastSyncedAt },
        {
          where: { id: this.id },
          transaction,
        }
      );
      return new Ok(undefined);
    } catch (err) {
      logger.error(
        { connectorId: this.connectorId, error: err },
        "Error updating lastSyncedAt"
      );
      return new Err(normalizeError(err));
    }
  }

  async updateLastMessageAt(
    sourceUpdatedAt: Date,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    try {
      await DustProjectConversationModel.update(
        { sourceUpdatedAt },
        {
          where: { id: this.id },
          transaction,
        }
      );
      return new Ok(undefined);
    } catch (err) {
      logger.error(
        { connectorId: this.connectorId, error: err },
        "Error updating sourceUpdatedAt"
      );
      return new Err(normalizeError(err));
    }
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await DustProjectConversationModel.destroy({
        where: { id: this.id },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      logger.error(
        { connectorId: this.connectorId, error: err },
        "Error deleting conversation"
      );
      return new Err(normalizeError(err));
    }
  }

  static async deleteByConnector(
    connector: ConnectorResource,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  static async getMaxSourceUpdatedAt(
    connectorId: ModelId
  ): Promise<Date | null> {
    const model = await DustProjectConversationModel.max<
      Date | null,
      DustProjectConversationModel
    >("sourceUpdatedAt", {
      where: { connectorId },
    });
    return model;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      connectorId: this.connectorId,
      conversationId: this.conversationId,
      projectId: this.projectId,
      lastSyncedAt: this.lastSyncedAt,
      sourceUpdatedAt: this.sourceUpdatedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
