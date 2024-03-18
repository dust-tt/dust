import type { ConnectorProvider, ReadonlyAttributesType, Result } from "@dust-tt/types";
import { BaseResource, Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  WhereOptions,
} from "sequelize";

import type {
  ConnectorProviderModelMapping,
  ConnectorProviderStrategy,
} from "@connectors/resources/connector/strategy";
import { getConnectorProviderStrategy } from "@connectors/resources/connector/strategy";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConnectorResource
  extends ReadonlyAttributesType<ConnectorModel> {}
export class ConnectorResource extends BaseResource<ConnectorModel> {
  static model: ModelStatic<ConnectorModel> = ConnectorModel;

  readonly providerStrategy: ConnectorProviderStrategy;

  // TODO(2024-02-20 flav): Delete Model from the constructor, once `update` has been migrated.
  constructor(
    model: ModelStatic<ConnectorModel>,
    blob: Attributes<ConnectorModel>
  ) {
    super(ConnectorModel, blob);

    const { type } = blob;

    this.providerStrategy = getConnectorProviderStrategy(type);
  }

  static async makeNew<T extends keyof ConnectorProviderModelMapping>(
    type: T,
    blob: Omit<CreationAttributes<ConnectorModel>, "type">,
    specificBlob: ConnectorProviderModelMapping[T]
  ) {
    return sequelizeConnection.transaction(async (transaction) => {
      const connector = await ConnectorModel.create(
        {
          ...blob,
          type,
        },
        { transaction }
      );

      const connectorRes = new this(ConnectorModel, connector.get());

      await connectorRes.providerStrategy.makeNew(
        connectorRes,
        specificBlob,
        transaction
      );

      return connectorRes;
    });
  }

  static async listByType(
    type: ConnectorProvider,
    { connectionId }: { connectionId?: string }
  ) {
    const where: WhereOptions<ConnectorModel> = {
      type,
    };

    if (connectionId) {
      where.connectionId = connectionId;
    }

    const blobs = await ConnectorResource.model.findAll({
      where,
    });

    return blobs.map(
      // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
      (b: ConnectorModel) => new ConnectorResource(ConnectorModel, b.get())
    );
  }

  static async findByDataSourceAndConnection(
    dataSource: {
      workspaceId: string;
      dataSourceName: string;
    },
    { connectionId }: { connectionId?: string } = {}
  ) {
    const where: WhereOptions<ConnectorModel> = {
      workspaceId: dataSource.workspaceId,
      dataSourceName: dataSource.dataSourceName,
    };

    if (connectionId) {
      where.connectionId = connectionId;
    }

    const blob = await ConnectorResource.model.findOne({
      where,
    });
    if (!blob) {
      return null;
    }

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new this(this.model, blob.get());
  }

  async delete(): Promise<Result<undefined, Error>> {
    return sequelizeConnection.transaction(async (transaction) => {
      try {
        await this.providerStrategy.delete(this, transaction);

        await this.model.destroy({
          where: {
            id: this.id,
          },
          transaction,
        });

        return new Ok(undefined);
      } catch (err) {
        return new Err(err as Error);
      }
    });
  }
}
