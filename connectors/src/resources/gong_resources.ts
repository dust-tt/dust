import type { Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

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
      timestampCursor: this.timestampCursor,
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

  async resetCursor(): Promise<void> {
    await this.update({ timestampCursor: null });
  }

  async setCursor(timestamp: number): Promise<void> {
    await this.update({ timestampCursor: timestamp });
  }
}
