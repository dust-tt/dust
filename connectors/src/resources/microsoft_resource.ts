import type { ModelId, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import {
  internalId as internalIdFromNode,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";
import {
  MicrosoftConfigurationModel,
  MicrosoftDeltaModel,
  MicrosoftNodeModel,
  MicrosoftRootModel,
} from "@connectors/lib/models/microsoft";
import { BaseResource } from "@connectors/resources/base_resource";
import type { WithCreationAttributes } from "@connectors/resources/connector/strategy";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import { MicrosoftNode } from "@connectors/connectors/microsoft/lib/types";
import { concurrentExecutor } from "@connectors/lib/async_utils";

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
        itemAPIPath: resourceIds,
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
      itemApiPath: this.itemAPIPath,
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

  static async getOrCreate(connectorId: ModelId, internalId: string) {
    const node = await this.fetchByInternalId(connectorId, internalId);

    if (node) {
      return node;
    }

    const { nodeType } = typeAndPathFromInternalId(internalId);

    // Create a new node -- name and mimeType will be populated during the sync
    const newNode = await MicrosoftNodeModel.create({
      connectorId,
      internalId,
      nodeType,
      name: null,
      parentInternalId: null,
      mimeType: null,
    });

    return new this(this.model, newNode.get());
  }

  static async batchGetOrCreateFromNodes(
    connectorId: ModelId,
    nodes: MicrosoftNode[]
  ): Promise<MicrosoftNodeResource[]> {
    const internalIds = nodes.map((root) => internalIdFromNode(root));

    const nodeModels = await MicrosoftNodeModel.findAll({
      where: {
        connectorId,
        internalId: internalIds,
      },
    });

    return concurrentExecutor(
      nodes,
      async (root) => {
        const internalId = internalIdFromNode(root);
        const node = nodeModels.find((node) => node.internalId === internalId);
        if (node) {
          return new this(this.model, node.get());
        }
        // Create a new node -- parentInternalId will be populated during the
        // sync if relevant
        const newNode = await MicrosoftNodeModel.create({
          connectorId,
          internalId,
          nodeType: root.nodeType,
          name: root.name,
          parentInternalId: null,
          mimeType: root.mimeType,
        });

        return new this(this.model, newNode.get());
      },
      { concurrency: 10 }
    );
  }

  toJSON() {
    return {
      id: this.id,
      nodeType: this.nodeType,
      connectorId: this.connectorId,
      internalId: this.internalId,
      parentInternalId: this.parentInternalId,
      name: this.name,
      mimeType: this.mimeType,
      lastSeenTs: this.lastSeenTs,
      lastUpsertedTs: this.lastUpsertedTs,
      skipReason: this.skipReason,
    };
  }
}
