import { Err, Ok, Result } from "@app/lib/result";

export type ConnectorsAPIErrorResponse = {
  message: string;
};

const { CONNECTORS_API_URL } = process.env;
if (!CONNECTORS_API_URL) {
  throw new Error("CONNECTORS_API_URL is not defined");
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
    const res = await fetch(
      `${CONNECTORS_API_URL}/connectors/create/${provider}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: workspaceId,
          APIKey: APIKey,
          dataSourceName: dataSourceName,
          nangoConnectionId: nangoConnectionId,
        }),
      }
    );

    return _resultFromResponse(res);
  },
};

async function _resultFromResponse<T>(
  response: Response
): Promise<ConnectorsAPIResponse<T>> {
  const jsonResponse = await response.json();
  if (jsonResponse.error) {
    return new Err(jsonResponse.error);
  }
  return new Ok(jsonResponse.response);
}
