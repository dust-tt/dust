import type { Client } from "@microsoft/microsoft-graph-client";
import type * as MicrosoftGraph from "@microsoft/microsoft-graph-types";

export async function getSites(client: Client): Promise<MicrosoftGraph.Site[]> {
  const res = await client
    .api("/sites?search=*")
    .select("id,name,displayName")
    .get();
  return res.value;
}

export async function getDrives(
  client: Client,
  siteId: string
): Promise<MicrosoftGraph.Drive[]> {
  const res = await client
    .api(`/sites/${siteId}/drives`)
    .select("id,name")
    .get();
  return res.value;
}

export async function getFilesAndFolders(
  client: Client,
  parentId: string
): Promise<MicrosoftGraph.DriveItem[]> {
  const [driveId, folderId] = parentId.split("/");

  const parent = folderId ? `items/${folderId}` : "root";
  const res = await client
    .api(`/drives/${driveId}/${parent}/children`)
    .select("id,name,createdDateTime,file,folder")
    .get();
  return res.value;
}

export async function getFolders(
  client: Client,
  parentId: string
): Promise<MicrosoftGraph.DriveItem[]> {
  const res = await getFilesAndFolders(client, parentId);
  return res.filter((item) => item.folder);
}

export async function getTeams(client: Client): Promise<MicrosoftGraph.Team[]> {
  const res = await client
    .api("/me/joinedTeams")
    .select("id,displayName")
    .get();
  return res.value;
}

export async function getChannels(
  client: Client,
  teamId: string
): Promise<MicrosoftGraph.Channel[]> {
  const res = await client
    .api(`/teams/${teamId}/channels`)
    .select("id,displayName")
    .get();
  return res.value;
}

export async function getMessages(
  client: Client,
  teamId: string,
  channelId: string
): Promise<MicrosoftGraph.Message[]> {
  const res = await client
    .api(`/teams/${teamId}/channels/${channelId}/messages`)
    .get();
  return res.value;
}
