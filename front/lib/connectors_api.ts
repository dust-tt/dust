import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";

export type ConnectorsAPIErrorResponse = {
  error: {
    message: string;
  };
};

const {
  CONNECTORS_API = "http://127.0.0.1:3002",
  DUST_CONNECTORS_SECRET = "",
} = process.env;

export type ConnectorsAPIResponse<T> = Result<T, ConnectorsAPIErrorResponse>;
export type ConnectorSyncStatus = "succeeded" | "failed";
const CONNECTOR_PROVIDERS = [
  "slack",
  "notion",
  "github",
  "google_drive",
] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];
export const CONNECTOR_PROVIDERS_USING_NANGO = [
  "slack",
  "notion",
  "google_drive",
] as const;
type ConnectorProviderUsingNango =
  (typeof CONNECTOR_PROVIDERS_USING_NANGO)[number];

export function connectorIsUsingNango(
  provider: string
): provider is ConnectorProviderUsingNango {
  return CONNECTOR_PROVIDERS_USING_NANGO.includes(provider as any);
}

export type ConnectorType = {
  id: string;
  type: ConnectorProvider;

  lastSyncStatus?: ConnectorSyncStatus;
  lastSyncStartTime?: number;
  lastSyncFinishTime?: number;
  lastSyncSuccessfulTime?: number;
  firstSuccessfulSyncTime?: number;
  firstSyncProgress?: string;
};

export type ConnectorPermission = "read" | null;
export type ConnectorResourceType = "file" | "folder" | "database" | "channel";

export type ConnectorResource = {
  provider: ConnectorProvider;
  internalId: string;
  parentInternalId: string | null;
  type: ConnectorResourceType;
  title: string;
  sourceUrl: string | null;
  expandable: boolean;
  permission: ConnectorPermission;
};

export type GoogleDriveFolderType = {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
};

export type GoogleDriveSelectedFolderType = GoogleDriveFolderType & {
  selected: boolean;
};

export const ConnectorsAPI = {
  async createConnector(
    provider: ConnectorProvider,
    workspaceId: string,
    workspaceAPIKey: string,
    dataSourceName: string,
    connectionId: string
  ): Promise<ConnectorsAPIResponse<ConnectorType>> {
    const res = await fetch(`${CONNECTORS_API}/connectors/create/${provider}`, {
      method: "POST",
      headers: getDefaultHeaders(),
      body: JSON.stringify({
        workspaceId,
        workspaceAPIKey,
        dataSourceName,
        connectionId,
      }),
    });

    return _resultFromResponse(res);
  },

  async pauseConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/pause/${connectorId}`,
      {
        method: "POST",
        headers: getDefaultHeaders(),
      }
    );

    return _resultFromResponse(res);
  },

  async resumeConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/resume/${connectorId}`,
      {
        method: "POST",
        headers: getDefaultHeaders(),
      }
    );

    return _resultFromResponse(res);
  },

  async syncConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/sync/${connectorId}`,
      {
        method: "POST",
        headers: getDefaultHeaders(),
      }
    );

    return _resultFromResponse(res);
  },

  async deleteConnector(
    connectorId: string,
    force = false
  ): Promise<ConnectorsAPIResponse<{ success: true }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/delete/${connectorId}?force=${
        force ? "true" : "false"
      }`,
      {
        method: "DELETE",
        headers: getDefaultHeaders(),
      }
    );

    return _resultFromResponse(res);
  },

  async getConnectorPermissions({
    connectorId,
    parentId,
  }: {
    connectorId: string;
    parentId?: string;
  }): Promise<ConnectorsAPIResponse<{ resources: ConnectorResource[] }>> {
    let url = `${CONNECTORS_API}/connectors/${connectorId}/permissions`;
    if (parentId) {
      url += `?parentId=${parentId}`;
    }
    const res = await fetch(url, {
      method: "GET",
      headers: getDefaultHeaders(),
    });

    return _resultFromResponse(res);
  },

  async getConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<ConnectorType>> {
    const res = await fetch(`${CONNECTORS_API}/connectors/${connectorId}`, {
      method: "GET",
      headers: getDefaultHeaders(),
    });

    return _resultFromResponse(res);
  },

  async batchGetConnectors(connectorIds: string[]): Promise<
    ConnectorsAPIResponse<{
      connectors: ConnectorType[];
    }>
  > {
    const res = await fetch(`${CONNECTORS_API}/connectors/batch`, {
      method: "GET",
      headers: getDefaultHeaders(),
      body: JSON.stringify({
        connector_ids: connectorIds,
      }),
    });

    return _resultFromResponse(res);
  },

  async setGoogleDriveFolders(
    connectorId: string,
    folders: string[]
  ): Promise<ConnectorsAPIResponse<void>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${connectorId}/google_drive/folders`,
      {
        method: "POST",
        headers: getDefaultHeaders(),
        body: JSON.stringify({
          folders: folders,
        }),
      }
    );

    return _resultFromResponse(res);
  },

  async getGoogleDriveFolders(
    connectorId: string,
    parentId?: string
  ): Promise<
    ConnectorsAPIResponse<{
      folders: GoogleDriveSelectedFolderType[];
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${connectorId}/google_drive/folders?parentId=${
        parentId || ""
      }`,
      {
        method: "GET",
        headers: getDefaultHeaders(),
      }
    );

    return _resultFromResponse(res);
  },
};

function getDefaultHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${DUST_CONNECTORS_SECRET}`,
  };
}
async function _resultFromResponse<T>(
  response: Response
): Promise<ConnectorsAPIResponse<T>> {
  if (!response.ok) {
    if (response.headers.get("Content-Type") === "application/json") {
      const jsonError = await response.json();
      logger.error({ jsonError }, "Unexpected response from ConnectorAPI");
      return new Err(jsonError);
    } else {
      logger.error(
        { statusCode: response.status, statusText: response.statusText },
        "Unexpected response from ConnectorAPI"
      );
      return new Err({
        error: {
          message: `Unexpected response status: ${response.status} ${response.statusText}`,
        },
      });
    }
  }
  const jsonResponse = await response.json();

  return new Ok(jsonResponse);
}
