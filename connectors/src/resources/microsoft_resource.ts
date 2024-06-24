import type { ModelId, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import {
  MicrosoftConfigurationModel,
  MicrosoftConfigurationRootModel,
} from "@connectors/lib/models/microsoft";
import { BaseResource } from "@connectors/resources/base_resource";
import type { WithCreationAttributes } from "@connectors/resources/connector/strategy";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MicrosoftConfigurationResource
  extends ReadonlyAttributesType<MicrosoftConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MicrosoftConfigurationResource extends BaseResource<MicrosoftConfigurationModel> {
  static model: ModelStatic<MicrosoftConfigurationModel> =
    MicrosoftConfigurationModel;

  constructor(
    model: ModelStatic<MicrosoftConfigurationModel>,
    blob: Attributes<MicrosoftConfigurationModel>
  ) {
    super(MicrosoftConfigurationModel, blob);
  }

  static async makeNew(
    blob: WithCreationAttributes<MicrosoftConfigurationModel>,
    transaction: Transaction
  ): Promise<MicrosoftConfigurationResource> {
    const config = await MicrosoftConfigurationModel.create(
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

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await MicrosoftConfigurationModel.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });

    return new Ok(undefined);
  }
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MicrosoftConfigurationRootResource
  extends ReadonlyAttributesType<MicrosoftConfigurationRootModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MicrosoftConfigurationRootResource extends BaseResource<MicrosoftConfigurationRootModel> {
  static model: ModelStatic<MicrosoftConfigurationRootModel> =
    MicrosoftConfigurationRootModel;

  constructor(
    model: ModelStatic<MicrosoftConfigurationRootModel>,
    blob: Attributes<MicrosoftConfigurationRootModel>
  ) {
    super(MicrosoftConfigurationRootModel, blob);
  }

  static async makeNew(
    blob: WithCreationAttributes<MicrosoftConfigurationRootModel>
  ) {
    const resource = await MicrosoftConfigurationRootModel.create(blob);
    return new this(this.model, resource.get());
  }

  static async batchMakeNew(
    blobs: WithCreationAttributes<MicrosoftConfigurationRootModel>[]
  ) {
    const resources = await MicrosoftConfigurationRootModel.bulkCreate(blobs);
    return resources.map((resource) => new this(this.model, resource.get()));
  }

  static async batchDelete(resourceIds: string[], transaction?: Transaction) {
    return MicrosoftConfigurationRootModel.destroy({
      where: {
        resourceId: resourceIds,
      },
      transaction,
    });
  }

  static async listRootsByConnectorId(
    connectorId: number
  ): Promise<MicrosoftConfigurationRootResource[]> {
    const resources = await MicrosoftConfigurationRootModel.findAll({
      where: {
        connectorId,
      },
    });

    return resources.map((resource) => new this(this.model, resource.get()));
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await MicrosoftConfigurationRootModel.destroy({
      where: {
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }
}
