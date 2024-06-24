import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ModelId,
  NangoConnectionId,
  Result,
} from "@dust-tt/types";
import { Ok } from "@dust-tt/types";

import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { launchMicrosoftFullSyncWorkflow } from "@connectors/connectors/microsoft/temporal/client";
import { syncSucceeded } from "@connectors/lib/sync_status";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export async function createMicrosoftConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  console.log("createMicrosoftConnector", dataSourceConfig, connectionId);

  const connector = await ConnectorResource.makeNew(
    "microsoft",
    {
      connectionId,
      workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    },
    {}
  );

  await syncSucceeded(connector.id);

  return new Ok(connector.id.toString());
}

export async function updateMicrosoftConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: string | null;
  }
): Promise<Result<string, ConnectorsAPIError>> {
  console.log("updateMicrosoftConnector", connectorId, connectionId);
  throw Error("Not implemented");
}

export async function stopMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("stopMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function deleteMicrosoftConnector(connectorId: ModelId) {
  console.log("deleteMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function pauseMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("pauseMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function unpauseMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("unpauseMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function resumeMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("resumeMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function fullResyncMicrosoftConnector(
  connectorId: ModelId,
  fromTs: number | null
) {
  console.log("fullResyncMicrosoftConnector", connectorId, fromTs);
  return launchMicrosoftFullSyncWorkflow(connectorId);
}

export async function cleanupMicrosoftConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("cleanupMicrosoftConnector", connectorId);
  throw Error("Not implemented");
}

export async function retrieveMicrosoftConnectorPermissions({
  connectorId,
  parentInternalId,
  viewType,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ContentNode[], Error>
> {
  console.log(
    "retrieveMicrosoftConnectorPermissions",
    connectorId,
    parentInternalId,
    viewType
  );
  throw Error("Not implemented");
}

export async function setMicrosoftConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  console.log("setMicrosoftConnectorPermissions", connectorId, permissions);
  throw Error("Not implemented");
}

export async function getMicrosoftConfig(
  connectorId: ModelId,
  configKey: string
): Promise<Result<string | null, Error>> {
  console.log("getMicrosoftConfig", connectorId, configKey);
  throw Error("Not implemented");
}

export async function setMicrosoftConfig(
  connectorId: ModelId,
  configKey: string,
  configValue: string
): Promise<Result<void, Error>> {
  console.log("setMicrosoftConfig", connectorId, configKey, configValue);
  throw Error("Not implemented");
}

export async function retrieveMicrosoftContentNodeParents(
  connectorId: ModelId,
  internalId: string,
  memoizationKey?: string
): Promise<Result<string[], Error>> {
  console.log(
    "retrieveMicrosoftContentNodeParents",
    connectorId,
    internalId,
    memoizationKey
  );
  throw Error("Not implemented");
}
export function retrieveMicrosoftContentNodes(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<ContentNode[], Error>> {
  console.log("retrieveMicrosoftContentNodes", connectorId, internalIds);
  throw Error("Not implemented");
}
