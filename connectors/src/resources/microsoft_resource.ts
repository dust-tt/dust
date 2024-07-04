import type { ModelId, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import {
  MicrosoftConfigurationModel,
  MicrosoftDeltaModel,
  MicrosoftNodeModel,
  MicrosoftRootModel,
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

  async postFetchHook(): Promise<void> {
    return;
  }

  static async makeNew(
    blob: WithCreationAttributes<MicrosoftConfigurationModel>,
    transaction: Transaction
  ): Promise<MicrosoftConfigurationResource> {
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
  ): Promise<Record<ModelId, MicrosoftConfigurationResource>> {
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
      {} as Record<ModelId, MicrosoftConfigurationResource>
    );
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await MicrosoftNodeModel.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });

    await MicrosoftDeltaModel.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });

    await MicrosoftRootModel.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });

    await this.model.destroy({
      where: {
        connectorId: this.connectorId,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  toJSON() {
    return {
      id: this.id,
      connectorId: this.connectorId,
    };
  }
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MicrosoftRootResource
  extends ReadonlyAttributesType<MicrosoftRootModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MicrosoftRootResource extends BaseResource<MicrosoftRootModel> {
  static model: ModelStatic<MicrosoftRootModel> = MicrosoftRootModel;

  constructor(
    model: ModelStatic<MicrosoftRootModel>,
    blob: Attributes<MicrosoftRootModel>
  ) {
    super(MicrosoftRootModel, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  static async makeNew(blob: WithCreationAttributes<MicrosoftRootModel>) {
    const resource = await MicrosoftRootModel.create(blob);
    return new this(this.model, resource.get());
  }

  static async batchMakeNew(
    blobs: WithCreationAttributes<MicrosoftRootModel>[]
  ) {
    const resources = await MicrosoftRootModel.bulkCreate(blobs);
    return resources.map((resource) => new this(this.model, resource.get()));
  }

  static async batchDelete({
    resourceIds,
    connectorId,
    transaction,
  }: {
    resourceIds: string[];
    connectorId: ModelId;
    transaction?: Transaction;
  }) {
    return MicrosoftRootModel.destroy({
      where: {
        itemApiPath: resourceIds,
        connectorId,
      },
      transaction,
    });
  }

  static async listRootsByConnectorId(
    connectorId: number
  ): Promise<MicrosoftRootResource[]> {
    const resources = await MicrosoftRootModel.findAll({
      where: {
        connectorId,
      },
    });

    return resources.map((resource) => new this(this.model, resource.get()));
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await MicrosoftRootModel.destroy({
      where: {
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  toJSON() {
    return {
      id: this.id,
      nodeType: this.nodeType,
      itemApiPath: this.itemApiPath,
      connectorId: this.connectorId,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MicrosoftNodeResource
  extends ReadonlyAttributesType<MicrosoftNodeModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MicrosoftNodeResource extends BaseResource<MicrosoftNodeModel> {
  static model: ModelStatic<MicrosoftNodeModel> = MicrosoftNodeModel;

  constructor(
    model: ModelStatic<MicrosoftNodeModel>,
    blob: Attributes<MicrosoftNodeModel>
  ) {
    super(MicrosoftNodeModel, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  static async makeNew(blob: WithCreationAttributes<MicrosoftNodeModel>) {
    const resource = await MicrosoftNodeModel.create(blob);
    return new this(this.model, resource.get());
  }

  static async upsert(blob: WithCreationAttributes<MicrosoftNodeModel>) {
    const [resource] = await MicrosoftNodeModel.upsert(blob);
    return new this(this.model, resource.get());
  }

  static async batchMakeNew(
    blobs: WithCreationAttributes<MicrosoftNodeModel>[]
  ) {
    const resources = await MicrosoftNodeModel.bulkCreate(blobs);
    return resources.map((resource) => new this(this.model, resource.get()));
  }

  static async fetchByInternalId(connectorId: ModelId, internalId: string) {
    const blob = await this.model.findOne({
      where: {
        connectorId,
        internalId,
      },
    });
    if (!blob) {
      return null;
    }

    return new this(this.model, blob.get());
  }

  async fetchChildren() {
    const blobs = await this.model.findAll({
      where: {
        connectorId: this.connectorId,
        parentInternalId: this.internalId,
      },
    });
    if (!blobs) {
      return [];
    }

    return blobs.map(
      (blob) =>
        new MicrosoftNodeResource(MicrosoftNodeResource.model, blob.get())
    );
  }

  static async batchDelete({
    resourceIds,
    connectorId,
    transaction,
  }: {
    resourceIds: string[];
    connectorId: ModelId;
    transaction?: Transaction;
  }) {
    return MicrosoftNodeModel.destroy({
      where: {
        internalId: resourceIds,
        connectorId,
      },
      transaction,
    });
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    await MicrosoftNodeModel.destroy({
      where: {
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  toJSON() {
    return {
      id: this.id,
      nodeType: this.nodeType,
      connectorId: this.connectorId,
    };
  }
}
