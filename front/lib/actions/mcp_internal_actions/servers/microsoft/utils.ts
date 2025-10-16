import type { Client } from "@microsoft/microsoft-graph-client";
import { Client as GraphClient } from "@microsoft/microsoft-graph-client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export async function getGraphClient(
  authInfo?: AuthInfo
): Promise<Client | null> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }

  return GraphClient.init({
    authProvider: (done) => done(null, accessToken),
  });
}
