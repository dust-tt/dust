import type {
  ConnectorPermission,
  ModelId,
  NangoConnectionId,
} from "@dust-tt/types";

import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { launchMicrosoftFullSyncWorkflow } from "@connectors/connectors/microsoft/temporal/client";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export type MicrosoftConnectorType = "microsoft_sharepoint" | "microsoft_teams";

export const createMicrosoftConnector =
  (connectorType: MicrosoftConnectorType) =>
  async (
    dataSourceConfig: DataSourceConfig,
    connectionId: NangoConnectionId
  ) => {
    console.log(
      "createMicrosoftConnector",
      connectorType,
      dataSourceConfig,
      connectionId
    );
    throw Error("Not implemented");
  };

export const updateMicrosoftConnector =
  (connectorType: MicrosoftConnectorType) =>
  (
    connectorId: ModelId,
    {
      connectionId,
    }: {
      connectionId?: string | null;
    }
  ) => {
    console.log(
      "updateMicrosoftConnector",
      connectorType,
      connectorId,
      connectionId
    );
    throw Error("Not implemented");
  };

export const stopMicrosoftConnector =
  (connectorType: MicrosoftConnectorType) => (connectorId: ModelId) => {
    console.log("stopMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const deleteMicrosoftConnector =
  (connectorType: MicrosoftConnectorType) => (connectorId: ModelId) => {
    console.log("deleteMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const pauseMicrosoftConnector =
  (connectorType: MicrosoftConnectorType) => (connectorId: ModelId) => {
    console.log("pauseMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const unpauseMicrosoftConnector =
  (connectorType: MicrosoftConnectorType) => (connectorId: ModelId) => {
    console.log("unpauseMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const resumeMicrosoftConnector =
  (connectorType: MicrosoftConnectorType) => (connectorId: ModelId) => {
    console.log("resumeMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const fullResyncMicrosoftConnector =
  (connectorType: MicrosoftConnectorType) =>
  async (connectorId: ModelId, fromTs: number | null) => {
    console.log(
      "fullResyncMicrosoftConnector",
      connectorType,
      connectorId,
      fromTs
    );
    return launchMicrosoftFullSyncWorkflow(connectorId);
  };

export const cleanupMicrosoftConnector =
  (connectorType: MicrosoftConnectorType) => (connectorId: ModelId) => {
    console.log("cleanupMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const retrieveMicrosoftConnectorPermissions =
  (connectorType: MicrosoftConnectorType) =>
  async ({
    connectorId,
    parentInternalId,
    viewType,
  }: Parameters<ConnectorPermissionRetriever>[0]) => {
    console.log(
      "retrieveMicrosoftConnectorPermissions",
      connectorType,
      connectorId,
      parentInternalId,
      viewType
    );
    throw Error("Not implemented");
  };

export const setMicrosoftConnectorPermissions =
  (connectorType: MicrosoftConnectorType) =>
  (connectorId: ModelId, permissions: Record<string, ConnectorPermission>) => {
    console.log(
      "setMicrosoftConnectorPermissions",
      connectorType,
      connectorId,
      permissions
    );
    throw Error("Not implemented");
  };

export const getMicrosoftConfig =
  (connectorType: MicrosoftConnectorType) =>
  (connectorId: ModelId, configKey: string) => {
    console.log("getMicrosoftConfig", connectorType, connectorId, configKey);
    throw Error("Not implemented");
  };

export const setMicrosoftConfig =
  (connectorType: MicrosoftConnectorType) =>
  (connectorId: ModelId, configKey: string, configValue: string) => {
    console.log(
      "setMicrosoftConfig",
      connectorType,
      connectorId,
      configKey,
      configValue
    );
    throw Error("Not implemented");
  };

export const retrieveMicrosoftContentNodeParents =
  (connectorType: MicrosoftConnectorType) =>
  (connectorId: ModelId, internalId: string, memoizationKey?: string) => {
    console.log(
      "retrieveMicrosoftContentNodeParents",
      connectorType,
      connectorId,
      internalId,
      memoizationKey
    );
    throw Error("Not implemented");
  };
export const retrieveMicrosoftContentNodes =
  (connectorType: MicrosoftConnectorType) =>
  (connectorId: ModelId, internalIds: string[]) => {
    console.log(
      "retrieveMicrosoftContentNodes",
      connectorType,
      connectorId,
      internalIds
    );
    throw Error("Not implemented");
  };
