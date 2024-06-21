import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ModelId,
  NangoConnectionId,
  Result,
} from "@dust-tt/types";

import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { launchMicrosoftSharepointFullSyncWorkflow } from "@connectors/connectors/microsoft/sharepoint/temporal/client";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export async function createMicrosoftSharepointConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  console.log(
    "createMicrosoftSharepointConnector",
    dataSourceConfig,
    connectionId
  );
  throw Error("Not implemented");
}

export async function updateMicrosoftSharepointConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: string | null;
  }
): Promise<Result<string, ConnectorsAPIError>> {
  console.log("updateMicrosoftSharepointConnector", connectorId, connectionId);
  throw Error("Not implemented");
}

export async function stopMicrosoftSharepointConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("stopMicrosoftSharepointConnector", connectorId);
  throw Error("Not implemented");
}

export async function deleteMicrosoftSharepointConnector(connectorId: ModelId) {
  console.log("deleteMicrosoftSharepointConnector", connectorId);
  throw Error("Not implemented");
}

export async function pauseMicrosoftSharepointConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("pauseMicrosoftSharepointConnector", connectorId);
  throw Error("Not implemented");
}

export async function unpauseMicrosoftSharepointConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("unpauseMicrosoftSharepointConnector", connectorId);
  throw Error("Not implemented");
}

export async function resumeMicrosoftSharepointConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("resumeMicrosoftSharepointConnector", connectorId);
  throw Error("Not implemented");
}

export async function fullResyncMicrosoftSharepointConnector(
  connectorId: ModelId,
  fromTs: number | null
) {
  console.log("fullResyncMicrosoftSharepointConnector", connectorId, fromTs);
  return launchMicrosoftSharepointFullSyncWorkflow(connectorId);
}

export async function cleanupMicrosoftSharepointConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  console.log("cleanupMicrosoftSharepointConnector", connectorId);
  throw Error("Not implemented");
}

export async function retrieveMicrosoftSharepointConnectorPermissions({
  connectorId,
  parentInternalId,
  viewType,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ContentNode[], Error>
> {
  console.log(
    "retrieveMicrosoftSharepointConnectorPermissions",
    connectorId,
    parentInternalId,
    viewType
  );
  throw Error("Not implemented");
}

export async function setMicrosoftSharepointConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  console.log(
    "setMicrosoftSharepointConnectorPermissions",
    connectorId,
    permissions
  );
  throw Error("Not implemented");
}

export async function getMicrosoftSharepointConfig(
  connectorId: ModelId,
  configKey: string
): Promise<Result<string | null, Error>> {
  console.log("getMicrosoftSharepointConfig", connectorId, configKey);
  throw Error("Not implemented");
}

export async function setMicrosoftSharepointConfig(
  connectorId: ModelId,
  configKey: string,
  configValue: string
): Promise<Result<void, Error>> {
  console.log(
    "setMicrosoftSharepointConfig",
    connectorId,
    configKey,
    configValue
  );
  throw Error("Not implemented");
}

export async function retrieveMicrosoftSharepointContentNodeParents(
  connectorId: ModelId,
  internalId: string,
  memoizationKey?: string
): Promise<Result<string[], Error>> {
  console.log(
    "retrieveMicrosoftSharepointContentNodeParents",
    connectorId,
    internalId,
    memoizationKey
  );
  throw Error("Not implemented");
}
export function retrieveMicrosoftSharepointContentNodes(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<ContentNode[], Error>> {
  console.log(
    "retrieveMicrosoftSharepointContentNodes",
    connectorId,
    internalIds
  );
  throw Error("Not implemented");
}
