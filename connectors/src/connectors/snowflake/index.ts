import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";

import { BaseConnectorManager } from "@connectors/connectors/interface";
import mainLogger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({
  connector: "snowflake",
});

export class SnowflakeConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, Error>> {
    logger.info({ dataSourceConfig, connectionId }, "To be implemented");
    throw new Error("Method not implemented.");
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorsAPIError>> {
    logger.info({ connectionId }, "To be implemented");
    throw new Error("Method not implemented.");
  }

  async clean(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async stop(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async resume(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    logger.info({ fromTs }, "To be implemented");
    throw new Error("Method not implemented.");
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
  }): Promise<Result<ContentNode[], Error>> {
    logger.info({ parentInternalId, filterPermission }, "To be implemented");
    throw new Error("Method not implemented.");
  }

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    logger.info({ permissions }, "To be implemented");
    throw new Error("Method not implemented.");
  }

  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    logger.info({ internalIds }, "To be implemented");
    throw new Error("Method not implemented.");
  }

  /**
   * Retrieves the parent IDs of a content node in hierarchical order.
   * The first ID is the internal ID of the content node itself.
   */
  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    logger.info({ internalId }, "To be implemented");
    throw new Error("Method not implemented.");
  }

  async pause(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async unpause(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async setConfigurationKey(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }

  async getConfigurationKey(): Promise<Result<string | null, Error>> {
    throw new Error("Method not implemented.");
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
