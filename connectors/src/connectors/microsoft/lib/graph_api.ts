import type { Client } from "@microsoft/microsoft-graph-client";
import type * as MicrosoftGraph from "@microsoft/microsoft-graph-types";

export async function getSites(client: Client) {
  const res = await client
    .api("/sites?search=*")
    .select("id,name,displayName")
    .get();
  return res.value as MicrosoftGraph.Site[];
}

export async function getDrives(client: Client, siteId: string) {
  const res = await client
    .api(`/sites/${siteId}/drives`)
    .select("id,name")
    .get();
  return res.value as MicrosoftGraph.Drive[];
}

export async function getFilesAndFolders(
  client: Client,
  driveId: string,
  parentId?: string
) {
  const parent = parentId ? `items/${parentId}` : "root";
  const res = await client
    .api(`/drives/${driveId}/${parent}/children`)
    .select("id,displayName")
    .get();
  return res.value as MicrosoftGraph.DriveItem[];
}

export async function getFolders(
  client: Client,
  driveId: string,
  parentId?: string
) {
  const res = await getFilesAndFolders(client, driveId, parentId);
  return res.filter((item) => item.folder);
}

export async function getTeams(client: Client) {
  const res = await client
    .api("/me/joinedTeams")
    .select("id,displayName")
    .get();
  return res.value as MicrosoftGraph.Team[];
}

export async function getChannels(client: Client, teamId: string) {
  const res = await client
    .api(`/teams/${teamId}/channels`)
    .select("id,displayName")
    .get();
  return res.value as MicrosoftGraph.Channel[];
}

export async function getMessages(
  client: Client,
  teamId: string,
  channelId: string
) {
  const res = await client
    .api(`/teams/${teamId}/channels/${channelId}/messages`)
    .get();
  return res.value as MicrosoftGraph.Message[];
}

export async function registerWebhook(client: Client, resource: string) {
  const { CONNECTORS_PUBLIC_URL, DUST_CONNECTORS_WEBHOOKS_SECRET } =
    process.env;
  const expirationDate = new Date(); // Now
  expirationDate.setDate(expirationDate.getDate() + 1);

  const res = await client.api("/subscriptions").post({
    changeType: "updated",
    notificationUrl: `${CONNECTORS_PUBLIC_URL}/webhooks/${DUST_CONNECTORS_WEBHOOKS_SECRET}/microsoft`,
    resource,
    expirationDateTime: expirationDate.toISOString(),
    clientState: "optional-client-specific-string",
  });

  return res.value as MicrosoftGraph.Subscription;
}
