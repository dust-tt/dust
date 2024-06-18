import type {
  ConnectorPermission,
  ModelId,
  NangoConnectionId,
} from "@dust-tt/types";

import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { launchMicrosoftFullSyncWorkflow } from "@connectors/connectors/microsoft/temporal/client";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export type MsConnectorType = "ms_sharepoint" | "ms_teams";

export const createMicrosoftConnector =
  (connectorType: MsConnectorType) =>
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
  (connectorType: MsConnectorType) =>
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
  (connectorType: MsConnectorType) => (connectorId: ModelId) => {
    console.log("stopMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const deleteMicrosoftConnector =
  (connectorType: MsConnectorType) => (connectorId: ModelId) => {
    console.log("deleteMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const pauseMicrosoftConnector =
  (connectorType: MsConnectorType) => (connectorId: ModelId) => {
    console.log("pauseMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const unpauseMicrosoftConnector =
  (connectorType: MsConnectorType) => (connectorId: ModelId) => {
    console.log("unpauseMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const resumeMicrosoftConnector =
  (connectorType: MsConnectorType) => (connectorId: ModelId) => {
    console.log("resumeMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const fullResyncMicrosoftConnector =
  (connectorType: MsConnectorType) =>
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
  (connectorType: MsConnectorType) => (connectorId: ModelId) => {
    console.log("cleanupMicrosoftConnector", connectorType, connectorId);
    throw Error("Not implemented");
  };

export const retrieveMicrosoftConnectorPermissions =
  (connectorType: MsConnectorType) =>
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
  (connectorType: MsConnectorType) =>
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
  (connectorType: MsConnectorType) =>
  (connectorId: ModelId, configKey: string) => {
    console.log("getMicrosoftConfig", connectorType, connectorId, configKey);
    throw Error("Not implemented");
  };

export const setMicrosoftConfig =
  (connectorType: MsConnectorType) =>
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
  (connectorType: MsConnectorType) =>
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
  (connectorType: MsConnectorType) =>
  (connectorId: ModelId, internalIds: string[]) => {
    console.log(
      "retrieveMicrosoftContentNodes",
      connectorType,
      connectorId,
      internalIds
    );
    throw Error("Not implemented");
  };
