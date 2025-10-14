import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type {
  ConnectorManagerError,
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ContentNode } from "@connectors/types";

export class MicrosoftBotConnectorManager extends BaseConnectorManager<null> {
  readonly provider: ConnectorProvider = "microsoft_bot";

  static async create(): Promise<
    Result<string, ConnectorManagerError<CreateConnectorErrorCode>>
  > {
    throw new Error("Method not implemented.");
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error(`Connector not found. ConnectorId: ${this.connectorId}`);
    }

    if (connectionId) {
      await connector.update({ connectionId });
    }

    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "Microsoft Bot connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    throw new Error("Method not implemented.");
  }

  async sync(): Promise<Result<string, Error>> {
    return new Ok("microsoft-bot-no-sync");
  }

  async retrievePermissions(): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    return new Ok([]);
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    return new Ok([internalId]);
  }

  async setPermissions(): Promise<Result<void, Error>> {
    return new Ok(undefined);
  }

  async setConfigurationKey(): Promise<Result<void, Error>> {
    return new Ok(undefined);
  }

  async getConfigurationKey(): Promise<Result<string | null, Error>> {
    throw new Error("Method not implemented.");
  }

  async stop(): Promise<Result<undefined, Error>> {
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    return new Ok(undefined);
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
