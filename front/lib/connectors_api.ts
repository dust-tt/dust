import { Err, Ok, Result } from "@app/lib/result";

export type ConnectorsAPIErrorResponse = {
  error: {
    message: string;
  };
};

const { CONNECTORS_API = "", DUST_CONNECTORS_SECRET = "" } = process.env;

export type ConnectorsAPIResponse<T> = Result<T, ConnectorsAPIErrorResponse>;
export type ConnectorSyncStatus = "succeeded" | "failed";

export type ConnectorProvider = "slack" | "notion";

export const ConnectorsAPI = {
  async createConnector(
    provider: ConnectorProvider,
    workspaceId: string,
    workspaceAPIKey: string,
    dataSourceName: string,
    nangoConnectionId: string
  ): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await fetch(`${CONNECTORS_API}/connectors/create/${provider}`, {
      method: "POST",
      headers: getDefaultHeaders(),
      body: JSON.stringify({
        workspaceId,
        workspaceAPIKey,
        dataSourceName,
        nangoConnectionId,
      }),
    });

    return _resultFromResponse(res);
  },

  async getSyncStatus(connectorId: string): Promise<
    ConnectorsAPIResponse<{
      lastSyncStatus: ConnectorSyncStatus;
      lastSyncStartTime: number;
      lastSuccessfulSyncTime: number;
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/sync_status/${connectorId}`,
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
      return new Err(await response.json());
    } else {
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
