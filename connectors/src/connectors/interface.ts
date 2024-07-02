import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  ModelId,
  Result,
} from "@dust-tt/types";
import type { ConnectorConfiguration } from "@dust-tt/types";

import type { DataSourceConfig } from "@connectors/types/data_source_config";

export abstract class BaseConnectorManager<T extends ConnectorConfiguration> {
  readonly connectorId: ModelId;

  constructor(connectorId: ModelId) {
    this.connectorId = connectorId;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async create(params: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
    configuration: ConnectorConfiguration;
  }): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  abstract update(params: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorsAPIError>>;

  abstract clean(params: { force: boolean }): Promise<Result<undefined, Error>>;

  abstract stop(): Promise<Result<undefined, Error>>;

  abstract resume(): Promise<Result<undefined, Error>>;

  abstract sync(params: {
    fromTs: number | null;
  }): Promise<Result<string, Error>>;

  abstract retrievePermissions(params: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>>;

  abstract setPermissions(params: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>>;

  abstract retrieveBatchContentNodes(params: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>>;

  abstract retrieveContentNodeParents(params: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>>;

  abstract setConfigurationKey(params: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>>;

  abstract getConfigurationKey(params: {
    configKey: string;
  }): Promise<Result<string | null, Error>>;

  abstract garbageCollect(): Promise<Result<string, Error>>;

  abstract pause(): Promise<Result<undefined, Error>>;

  abstract unpause(): Promise<Result<undefined, Error>>;

  abstract configure(params: {
    configuration: T;
  }): Promise<Result<void, Error>>;
}
