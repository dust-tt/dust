import type {
  ConnectorPermission,
  ModelId,
  NangoConnectionId,
} from "@dust-tt/types";
import { assertNever, Ok } from "@dust-tt/types";
import { Client } from "@microsoft/microsoft-graph-client";

import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import {
  getSites,
  getTeams,
} from "@connectors/connectors/microsoft/lib/graph_api";
import { launchMicrosoftFullSyncWorkflow } from "@connectors/connectors/microsoft/temporal/client";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import { syncSucceeded } from "@connectors/lib/sync_status";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export type MsConnectorType = "ms_sharepoint" | "ms_teams";

const {
  NANGO_MICROSOFT_SHAREPOINT_CONNECTOR_ID = "",
  NANGO_MICROSOFT_TEAMS_CONNECTOR_ID = "",
} = process.env;

function getIntegrationId(connectorType: MsConnectorType) {
  switch (connectorType) {
    case "ms_sharepoint":
      return NANGO_MICROSOFT_SHAREPOINT_CONNECTOR_ID;
    case "ms_teams":
      return NANGO_MICROSOFT_TEAMS_CONNECTOR_ID;
    default:
      assertNever(connectorType);
  }
}

async function getClient(
  connectionId: NangoConnectionId,
  connectorType: MsConnectorType
) {
  const nangoConnectionId = connectionId;

  const msAccessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: getIntegrationId(connectorType),
    useCache: false,
  });

  return Client.init({
    authProvider: (done) => done(null, msAccessToken),
  });
}

export const createMicrosoftConnector =
  (connectorType: MsConnectorType) =>
  async (
    dataSourceConfig: DataSourceConfig,
    connectionId: NangoConnectionId
  ) => {
    const client = await getClient(connectionId, connectorType);
    if (connectorType === "ms_sharepoint") {
      await getSites(client);
    }
    if (connectorType === "ms_teams") {
      await getTeams(client);
    }

    //   const webhook = await registerWebhook(client, `drives/${drives[0].id}/root`);

    const connector = await ConnectorResource.makeNew(
      connectorType,
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
