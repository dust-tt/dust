import { ConfluenceClient } from "@connectors/connectors/confluence/lib/confluence_client";

export async function getConfluenceCloudInformation(accessToken: string) {
  const client = new ConfluenceClient(accessToken);

  try {
    return await client.getCloudInformation();
  } catch (err) {
    return null;
  }
}

export function listConfluenceSpaces(accessToken: string, cloudId: string) {
  const client = new ConfluenceClient(accessToken, { cloudId });

  return client.getGlobalSpaces();
}
