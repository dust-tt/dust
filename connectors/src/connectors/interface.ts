import type { Result } from "@dust-tt/client";

import type {
  ConnectorConfiguration,
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
} from "@connectors/types";
import type { ModelId } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";

export type CreateConnectorErrorCode = "INVALID_CONFIGURATION";

export type UpdateConnectorErrorCode =
  | "INVALID_CONFIGURATION"
  | "CONNECTOR_OAUTH_TARGET_MISMATCH"
  | "CONNECTOR_OAUTH_USER_MISSING_RIGHTS";

export type RetrievePermissionsErrorCode =
  | "INVALID_PARENT_INTERNAL_ID"
  | "INVALID_FILTER_PERMISSION"
  | "EXTERNAL_OAUTH_TOKEN_ERROR"
  | "CONNECTOR_NOT_FOUND"
  | "RATE_LIMIT_ERROR";

export class ConnectorManagerError<T extends string> extends Error {
  code: T;

  constructor(code: T, message: string) {
    super(message);
    this.name = "ConnectorManagerError";
    this.code = code;
  }
}

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
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    throw new Error("Method not implemented.");
  }

  abstract update(params: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>>;

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
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  >;

  /**
   * Retrieves the parent IDs of a content node in hierarchical order.
   * The first ID is the internal ID of the content node itself.
   */
  abstract retrieveContentNodeParents(params: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>>;

  abstract setPermissions(params: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>>;

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
