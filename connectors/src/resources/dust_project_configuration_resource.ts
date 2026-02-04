import { DustProjectConfigurationModel } from "@connectors/lib/models/dust_project";
import logger from "@connectors/logger/logger";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DustProjectConfigurationResource
  extends ReadonlyAttributesType<DustProjectConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DustProjectConfigurationResource extends BaseResource<DustProjectConfigurationModel> {
  static model: ModelStatic<DustProjectConfigurationModel> =
    DustProjectConfigurationModel;

  constructor(
    model: ModelStatic<DustProjectConfigurationModel>,
    blob: Attributes<DustProjectConfigurationModel>
  ) {
    super(DustProjectConfigurationModel, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  static async makeNew({
    connectorId,
    projectId,
    transaction,
  }: {
    connectorId: ModelId;
    projectId: string;
    transaction: Transaction;
  }): Promise<DustProjectConfigurationResource> {
    const model = await DustProjectConfigurationModel.create(
      {
        connectorId,
        projectId,
      },
      { transaction }
    );

    return new DustProjectConfigurationResource(DustProjectConfigurationModel, {
      ...model.get({ plain: true }),
    });
  }

  static async fetchByConnectorId(
    connectorId: ModelId
  ): Promise<DustProjectConfigurationResource | null> {
    const model = await DustProjectConfigurationModel.findOne({
      where: {
        connectorId,
      },
    });

    if (!model) {
      return null;
    }

    return new DustProjectConfigurationResource(DustProjectConfigurationModel, {
      ...model.get({ plain: true }),
    });
  }

  async updateLastSyncedAt(
    lastSyncedAt: Date | null,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    try {
      await DustProjectConfigurationModel.update(
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

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await DustProjectConfigurationModel.destroy({
        where: { id: this.id },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      logger.error(
        { connectorId: this.connectorId, error: err },
        "Error deleting configuration"
      );
      return new Err(normalizeError(err));
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      connectorId: this.connectorId,
      projectId: this.projectId,
      lastSyncedAt: this.lastSyncedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
