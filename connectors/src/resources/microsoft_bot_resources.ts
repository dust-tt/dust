import type { Result } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import { MicrosoftBotConfigurationModel } from "@connectors/lib/models/microsoft_bot";
import { BaseResource } from "@connectors/resources/base_resource";
import type { WithCreationAttributes } from "@connectors/resources/connector/strategy";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type { ModelId } from "@connectors/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MicrosoftBotConfigurationResource
  extends ReadonlyAttributesType<MicrosoftBotConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MicrosoftBotConfigurationResource extends BaseResource<MicrosoftBotConfigurationModel> {
  static model: ModelStatic<MicrosoftBotConfigurationModel> =
    MicrosoftBotConfigurationModel;

  constructor(
    model: ModelStatic<MicrosoftBotConfigurationModel>,
    blob: Attributes<MicrosoftBotConfigurationModel>
  ) {
    super(MicrosoftBotConfigurationModel, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  static async makeNew(
    blob: WithCreationAttributes<MicrosoftBotConfigurationModel>,
    transaction: Transaction
  ): Promise<MicrosoftBotConfigurationResource> {
    const config = await this.model.create(
      {
        ...blob,
      },
      { transaction }
    );

    return new this(this.model, config.get());
  }

  static async fetchByConnectorId(connectorId: ModelId) {
    const blob = await this.model.findOne({
      where: {
        connectorId: connectorId,
      },
    });
    if (!blob) {
      return null;
    }

    return new this(this.model, blob.get());
  }

  static async fetchByConnectorIds(
    connectorIds: ModelId[]
  ): Promise<Record<ModelId, MicrosoftBotConfigurationResource>> {
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
      {} as Record<ModelId, MicrosoftBotConfigurationResource>
    );
  }

  static async fetchByTenantId(tenantId: string) {
    const blob = await this.model.findOne({
      where: {
        tenantId: tenantId,
      },
    });
    if (!blob) {
      return null;
    }

    return new this(this.model, blob.get());
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

  toJSON(): {
    id: number;
    connectorId: number;
    botEnabled: boolean;
    tenantId: string;
  } {
    return {
      id: this.id,
      connectorId: this.connectorId,
      botEnabled: this.botEnabled,
      tenantId: this.tenantId,
    };
  }
}
