import type { ModelId, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

import type {
  MicrosoftNode,
  MicrosoftNodeType,
} from "@connectors/connectors/microsoft/lib/types";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  MicrosoftConfigurationModel,
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
        internalId: resourceIds,
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

  toJSON() {
    return {
      id: this.id,
      nodeType: this.nodeType,
      internalId: this.internalId,
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

  static async fetchNodesWithoutParents() {
    const blobs = await this.model.findAll({
      where: {
        parentInternalId: null,
      },
    });
    return blobs.map((blob) => new this(this.model, blob.get()));
  }

  static async fetchByInternalIds(connectorId: ModelId, internalIds: string[]) {
    const blobs = await this.model.findAll({
      where: {
        connectorId,
        internalId: internalIds,
      },
    });

    return blobs.map((blob) => new this(this.model, blob.get()));
  }

  async fetchChildren(nodeTypes?: MicrosoftNodeType[]) {
    const whereClause: {
      connectorId: number;
      parentInternalId: string;
      nodeType?: { [Op.in]: MicrosoftNodeType | MicrosoftNodeType[] };
    } = {
      connectorId: this.connectorId,
      parentInternalId: this.internalId,
    };

    if (nodeTypes) {
      whereClause.nodeType = { [Op.in]: nodeTypes };
    }

    const blobs = await this.model.findAll({
      where: whereClause,
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

  static async updateOrCreate(
    connectorId: ModelId,
    node: MicrosoftNode
  ): Promise<MicrosoftNodeResource> {
    const res = await this.batchUpdateOrCreate(connectorId, [node]);

    if (res.length !== 1 || !res[0]) {
      throw new Error(
        "Unreachable: batchUpdateOrCreate returned 0 or more than 1 resources"
      );
    }

    return res[0];
  }

  static async batchUpdateOrCreate(
    connectorId: ModelId,
    nodes: MicrosoftNode[]
  ): Promise<MicrosoftNodeResource[]> {
    const internalIds = nodes.map((n) => n.internalId);

    const existingNodeResources =
      await MicrosoftNodeResource.fetchByInternalIds(connectorId, internalIds);

    // update existing resources
    await concurrentExecutor(
      existingNodeResources,
      async (resource) => {
        const node = nodes.find(
          (node) => node.internalId === resource.internalId
        );
        if (!node) {
          throw new Error(
            `Unreachable: node not found with internalId ${resource.internalId}`
          );
        }
        return resource.update(node);
      },
      { concurrency: 10 }
    );

    // create new resources
    const inexistantNodes = nodes.filter(
      (node) =>
        !existingNodeResources.find(
          (resource) => resource.internalId === node.internalId
        )
    );

    const newNodeResources = await MicrosoftNodeResource.batchMakeNew(
      inexistantNodes.map((node) => ({
        connectorId,
        internalId: node.internalId,
        nodeType: node.nodeType,
        name: node.name,
        parentInternalId: node.parentInternalId,
        mimeType: node.mimeType,
      }))
    );

    return [...existingNodeResources, ...newNodeResources];
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

  /** String representation of this node and its descendants in treeLike fashion */
  async treeString(level = 0): Promise<string> {
    const childrenStrings = await Promise.all(
      (await this.fetchChildren()).map(async (c) => c.treeString(level + 1))
    );
    const hyphens = "\n" + "-".repeat(level * 2);

    return `${this.name}${this.nodeType === "folder" ? "/" : ""}${childrenStrings.length > 0 ? hyphens + childrenStrings.join(hyphens) : ""}`;
  }
}
