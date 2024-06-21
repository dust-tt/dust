import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ModelId,
  NangoConnectionId,
  Result,
} from "@dust-tt/types";

import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { launchMicrosoftTeamsFullSyncWorkflow } from "@connectors/connectors/microsoft/teams/temporal/client";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export async function createMicrosoftTeamsConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  console.log("createMicrosoftTeamsConnector", dataSourceConfig, connectionId);
  throw Error("Not implemented");
}

export async function updateMicrosoftTeamsConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: string | null;
  }
): Promise<Result<string, ConnectorsAPIError>> {
  console.log("updateMicrosoftTeamsConnector", connectorId, connectionId);
  throw Error("Not implemented");
}

export async function stopMicrosoftTeamsConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("stopMicrosoftTeamsConnector", connectorId);
  throw Error("Not implemented");
}

export async function deleteMicrosoftTeamsConnector(connectorId: ModelId) {
  console.log("deleteMicrosoftTeamsConnector", connectorId);
  throw Error("Not implemented");
}

export async function pauseMicrosoftTeamsConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("pauseMicrosoftTeamsConnector", connectorId);
  throw Error("Not implemented");
}

export async function unpauseMicrosoftTeamsConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("unpauseMicrosoftTeamsConnector", connectorId);
  throw Error("Not implemented");
}

export async function resumeMicrosoftTeamsConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("resumeMicrosoftTeamsConnector", connectorId);
  throw Error("Not implemented");
}

export async function fullResyncMicrosoftTeamsConnector(
  connectorId: ModelId,
  fromTs: number | null
) {
  console.log("fullResyncMicrosoftTeamsConnector", connectorId, fromTs);
  return launchMicrosoftTeamsFullSyncWorkflow(connectorId);
}

export async function cleanupMicrosoftTeamsConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("cleanupMicrosoftTeamsConnector", connectorId);
  throw Error("Not implemented");
}

export async function retrieveMicrosoftTeamsConnectorPermissions({
  connectorId,
  parentInternalId,
  viewType,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ContentNode[], Error>
> {
  console.log(
    "retrieveMicrosoftTeamsConnectorPermissions",
    connectorId,
    parentInternalId,
    viewType
  );
  throw Error("Not implemented");
}

export async function setMicrosoftTeamsConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  console.log(
    "setMicrosoftTeamsConnectorPermissions",
    connectorId,
    permissions
  );
  throw Error("Not implemented");
}

export async function getMicrosoftTeamsConfig(
  connectorId: ModelId,
  configKey: string
): Promise<Result<string | null, Error>> {
  console.log("getMicrosoftConfig", connectorId, configKey);
  throw Error("Not implemented");
}

export async function setMicrosoftTeamsConfig(
  connectorId: ModelId,
  configKey: string,
  configValue: string
): Promise<Result<void, Error>> {
  console.log("setMicrosoftConfig", connectorId, configKey, configValue);
  throw Error("Not implemented");
}

export async function retrieveMicrosoftTeamsContentNodeParents(
  connectorId: ModelId,
  internalId: string,
  memoizationKey?: string
): Promise<Result<string[], Error>> {
  console.log(
    "retrieveMicrosoftTeamsContentNodeParents",
    connectorId,
    internalId,
    memoizationKey
  );
  throw Error("Not implemented");
}
export async function retrieveMicrosoftTeamsContentNodes(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<ContentNode[], Error>> {
  console.log("retrieveMicrosoftTeamsContentNodes", connectorId, internalIds);
  throw Error("Not implemented");
}
