import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";

import logger from "@connectors/logger/logger";
import { BaseResource } from "@connectors/resources/base_resource";
import type {
  ConnectorProviderConfigurationResource,
  ConnectorProviderModelMapping,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
} from "@connectors/resources/connector/strategy";
import { getConnectorProviderStrategy } from "@connectors/resources/connector/strategy";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type {
  ConnectorErrorType,
  ConnectorType,
  ModelId,
} from "@connectors/types";
import { normalizeError } from "@connectors/types";
import { withTransaction } from "@connectors/types/shared/utils/sql_utils";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConnectorResource
  extends ReadonlyAttributesType<ConnectorModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConnectorResource extends BaseResource<ConnectorModel> {
  static model: ModelStatic<ConnectorModel> = ConnectorModel;

  private _configuration: ConnectorProviderConfigurationResource | null = null;

  // TODO(2024-02-20 flav): Delete Model from the constructor, once `update` has been migrated.
  constructor(
    model: ModelStatic<ConnectorModel>,
    blob: Attributes<ConnectorModel>
  ) {
    super(ConnectorModel, blob);
  }

  async postFetchHook() {
    const configurations =
      await this.strategy.fetchConfigurationsbyConnectorIds([this.id]);
    this._configuration = configurations[this.id] ?? null;
  }

  get strategy(): ConnectorProviderStrategy<
    // TODO(salesforce): implement this
    Exclude<ConnectorProvider, "salesforce">
  > {
    return getConnectorProviderStrategy(this.type);
  }

  static async makeNew<T extends keyof ConnectorProviderModelMapping>(
    type: T,
    blob: Omit<CreationAttributes<ConnectorModel>, "type">,
    specificBlob: ConnectorProviderModelMapping[T],
    transaction?: Transaction
  ) {
    const connector = await withTransaction(async (t: Transaction) => {
      const connector = await ConnectorModel.create(
        {
          ...blob,
          type,
        },
        { transaction: t }
      );

      const connectorRes = new this(ConnectorModel, connector.get());

      const configuration = await connectorRes.strategy.makeNew(
        connector.id,
        specificBlob,
        t
      );

      connectorRes._configuration = configuration;

      return connectorRes;
    }, transaction);

    return connector;
  }

  static async listByType(
    // TODO(salesforce): implement this
    type: Exclude<ConnectorProvider, "salesforce">,
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

    const connectors = blobs.map((b: ConnectorModel) => {
      const c = new this(this.model, b.get());
      c._configuration = configurations[b.id] ?? null;
      return c;
    });

    return connectors;
  }

  static async findByDataSource(dataSource: {
    workspaceId: string;
    dataSourceId: string;
  }) {
    const where: WhereOptions<ConnectorModel> = {
      workspaceId: dataSource.workspaceId,
      dataSourceId: dataSource.dataSourceId,
    };

    const blob = await ConnectorResource.model.findOne({
      where,
    });
    if (!blob) {
      return null;
    }

    const c = new this(this.model, blob.get());
    await c.postFetchHook();
    return c;
  }

  static async findByWorkspaceIdAndType(
    workspaceId: string,
    type: ConnectorProvider
  ) {
    const blob = await ConnectorResource.model.findOne({
      where: {
        workspaceId,
        type,
      },
    });
    if (!blob) {
      return null;
    }

    const c = new this(this.model, blob.get());
    await c.postFetchHook();
    return c;
  }

  static async fetchByIds(
    // TODO(salesforce): implement this
    type: Exclude<ConnectorProvider, "salesforce">,
    ids: (ModelId | string)[]
  ) {
    const parsedIds = ids
      .map((id) => {
        const parsed = typeof id === "string" ? parseInt(id, 10) : id;
        if (isNaN(parsed)) {
          logger.error(
            { originalId: id, type },
            "Received invalid connector ID (NaN)"
          );
        }
        return parsed;
      })
      .filter((id) => !isNaN(id));

    if (parsedIds.length === 0) {
      return [];
    }

    const blobs = await ConnectorResource.model.findAll({
      where: {
        type,
        id: parsedIds,
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
      c._configuration = configurations[b.id] ?? null;
      return c;
    });
  }

  async delete(): Promise<Result<undefined, Error>> {
    return withTransaction(async (transaction) => {
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
        return new Err(normalizeError(err));
      }
    });
  }

  isPaused() {
    return !!this.pausedAt;
  }

  async markAsPaused() {
    return this.update({ pausedAt: new Date() });
  }

  // Unpausing a connector necessarily means clearing the connector errorType.
  async markAsUnpaused() {
    return this.update({
      errorType: null,
      pausedAt: null,
    });
  }

  async markAsError(errorType: ConnectorErrorType) {
    return this.update({
      errorType,
    });
  }

  // Metadata.

  async markAsRateLimited() {
    return this.update({
      metadata: {
        ...this.metadata,
        rateLimited: { at: new Date() },
      },
    });
  }

  async markAsNotRateLimited() {
    return this.update({
      metadata: {
        ...this.metadata,
        rateLimited: null,
      },
    });
  }

  get isAuthTokenRevoked() {
    return this.errorType === "oauth_token_revoked";
  }

  get isThirdPartyInternalError() {
    return this.errorType === "third_party_internal_error";
  }

  get configuration(): ConnectorProviderConfigurationResource | null {
    return this._configuration;
  }

  toJSON(): ConnectorType {
    return {
      id: this.id.toString(),
      type: this.type,
      connectionId: this.connectionId,
      workspaceId: this.workspaceId,
      dataSourceId: this.dataSourceId,
      useProxy: this.useProxy ?? false,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncStartTime: this.lastSyncStartTime?.getTime(),
      lastSyncFinishTime: this.lastSyncFinishTime?.getTime(),
      lastSyncSuccessfulTime: this.lastSyncSuccessfulTime?.getTime(),
      firstSuccessfulSyncTime: this.firstSuccessfulSyncTime?.getTime(),
      firstSyncProgress: this.firstSyncProgress,
      errorType: this.errorType ?? undefined,
      configuration: this._configuration
        ? this.strategy.configurationJSON(this._configuration)
        : null,
      pausedAt: this.pausedAt?.getTime(),
      updatedAt: this.updatedAt.getTime(),
    };
  }

  async setUseProxy(useProxy: boolean) {
    await this.update({ useProxy });
  }
}
