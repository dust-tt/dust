import type {
  ConnectorConfiguration,
  ConnectorProvider,
  ConnectorType,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  WhereOptions,
} from "sequelize";

import { BaseResource } from "@connectors/resources/base_resource";
import type {
  ConnectorProviderConfigurationResource,
  ConnectorProviderModelMapping,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
} from "@connectors/resources/connector/strategy";
import { getConnectorProviderStrategy } from "@connectors/resources/connector/strategy";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConnectorResource
  extends ReadonlyAttributesType<ConnectorModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConnectorResource extends BaseResource<ConnectorModel> {
  static model: ModelStatic<ConnectorModel> = ConnectorModel;

  private configuration: ConnectorProviderConfigurationResource | null = null;

  // TODO(2024-02-20 flav): Delete Model from the constructor, once `update` has been migrated.
  constructor(
    model: ModelStatic<ConnectorModel>,
    blob: Attributes<ConnectorModel>
  ) {
    super(ConnectorModel, blob);
  }

  get strategy(): ConnectorProviderStrategy<ConnectorProvider> {
    return getConnectorProviderStrategy(this.type);
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

      const strategy = getConnectorProviderStrategy(type);

      const configuration = await strategy.makeNew(
        connector.id,
        specificBlob,
        transaction
      );

      const connectorRes = new this(ConnectorModel, connector.get());
      connectorRes.configuration = configuration;

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

    const configurations: Record<
      ModelId,
      ConnectorProviderModelResourceMapping[typeof type]
    > = await getConnectorProviderStrategy(
      type
    ).fetchConfigurationsbyConnectorIds(blobs.map((c) => c.id));

    const connectors = blobs.map(
      // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
      (b: ConnectorModel) => {
        const c = new ConnectorResource(ConnectorModel, b.get());
        c.configuration = configurations[b.id] ?? null;
        return c;
      }
    );

    return connectors;
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

    const configurations: Record<
      ModelId,
      ConnectorProviderModelResourceMapping[typeof blob.type]
    > = await getConnectorProviderStrategy(
      blob.type
    ).fetchConfigurationsbyConnectorIds([blob.id]);

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    const connectorRes = new this(this.model, blob.get());
    connectorRes.configuration = configurations[blob.id] ?? null;
    return connectorRes;
  }

  static async fetchByIds(type: ConnectorProvider, ids: ModelId[]) {
    const blobs = await ConnectorResource.model.findAll({
      where: {
        type,
        id: ids,
      },
    });

    const configurations: Record<
      ModelId,
      ConnectorProviderModelResourceMapping[typeof type]
    > = await getConnectorProviderStrategy(
      type
    ).fetchConfigurationsbyConnectorIds(blobs.map((c) => c.id));

    return blobs.map((b: ConnectorModel) => {
      const c = new this(this.model, b.get());
      c.configuration = configurations[b.id] ?? null;
      return c;
    });
  }

  async delete(): Promise<Result<undefined, Error>> {
    return sequelizeConnection.transaction(async (transaction) => {
      try {
        await this.strategy.delete(this, transaction);

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

  isPaused() {
    return !!this.pausedAt;
  }

  async markAsPaused() {
    return this.update({ pausedAt: new Date() });
  }

  async markAsUnpaused() {
    return this.update({ pausedAt: null });
  }

  get isAuthTokenRevoked() {
    return this.errorType === "oauth_token_revoked";
  }

  get isThirdPartyInternalError() {
    return this.errorType === "third_party_internal_error";
  }

  toJSON(): ConnectorType {
    return {
      id: this.id.toString(),
      type: this.type,
      workspaceId: this.workspaceId,
      dataSourceName: this.dataSourceName,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncStartTime: this.lastSyncStartTime?.getTime(),
      lastSyncSuccessfulTime: this.lastSyncSuccessfulTime?.getTime(),
      firstSuccessfulSyncTime: this.firstSuccessfulSyncTime?.getTime(),
      firstSyncProgress: this.firstSyncProgress,
      errorType: this.errorType ?? undefined,
      // TODO remove `as` once we have a shared interface for configuration resources.
      configuration: (this.configuration?.toJSON() ??
        null) as ConnectorConfiguration,
      pausedAt: this.pausedAt,
      updatedAt: this.updatedAt.getTime(),
    };
  }
}
