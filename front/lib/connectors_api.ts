import { Err, Ok, Result } from "@app/lib/result";

export type ConnectorsAPIErrorResponse = {
  error: {
    message: string;
  };
};

const { CONNECTORS_API, DUST_CONNECTORS_SECRET } = process.env;
if (!CONNECTORS_API) {
  throw new Error("CONNECTORS_API is not defined");
}

if (!DUST_CONNECTORS_SECRET) {
  throw new Error("DUST_CONNECTORS_SECRET is not defined");
}

export type ConnectorsAPIResponse<T> = Result<T, ConnectorsAPIErrorResponse>;

export const ConnectorsAPI = {
  async createConnector(
    provider: string,
    workspaceId: string,
    APIKey: string,
    dataSourceName: string,
    nangoConnectionId: string
  ): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    console.log("sending headers: ", getDefaultHeaders());
    const res = await fetch(`${CONNECTORS_API}/connectors/create/${provider}`, {
      method: "POST",
      headers: getDefaultHeaders(),
      body: JSON.stringify({
        workspaceId: workspaceId,
        APIKey: APIKey,
        dataSourceName: dataSourceName,
        nangoConnectionId: nangoConnectionId,
      }),
    });

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
