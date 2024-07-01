import type { Client } from "@microsoft/microsoft-graph-client";
import type * as MicrosoftGraph from "@microsoft/microsoft-graph-types";

import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/node_types";
import { isValidNodeType } from "@connectors/connectors/microsoft/lib/node_types";

export async function getSites(client: Client): Promise<MicrosoftGraph.Site[]> {
  const res = await client
    .api("/sites?search=*")
    .select("id,name,displayName")
    .get();
  return res.value;
}

export async function getDrives(
  client: Client,
  parentInternalId: string
): Promise<MicrosoftGraph.Drive[]> {
  const { nodeType, itemApiPath: parentResourcePath } =
    microsoftNodeDataFromInternalId(parentInternalId);

  if (nodeType !== "site") {
    throw new Error(
      `Invalid node type: ${nodeType} for getDrives, expected site`
    );
  }

  const res = await client
    .api(`${parentResourcePath}/drives`)
    .select("id,name")
    .get();
  return res.value;
}

export async function getFilesAndFolders(
  client: Client,
  parentInternalId: string
): Promise<MicrosoftGraph.DriveItem[]> {
  const { nodeType, itemApiPath: parentResourcePath } =
    microsoftNodeDataFromInternalId(parentInternalId);

  if (nodeType !== "drive" && nodeType !== "folder") {
    throw new Error(
      `Invalid node type: ${nodeType} for getFilesAndFolders, expected drive or folder`
    );
  }
  const endpoint =
    nodeType === "drive"
      ? `${parentResourcePath}/root/children`
      : `${parentResourcePath}/children`;
  const res = await client
    .api(endpoint)
    .select("id,name,createdDateTime,file,folder")
    .get();
  return res.value;
}

export async function getFolders(
  client: Client,
  parentInternalId: string
): Promise<MicrosoftGraph.DriveItem[]> {
  const res = await getFilesAndFolders(client, parentInternalId);
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
  parentInternalId: string
): Promise<MicrosoftGraph.Channel[]> {
  const { nodeType, itemApiPath: parentResourcePath } =
    microsoftNodeDataFromInternalId(parentInternalId);

  if (nodeType !== "team") {
    throw new Error(
      `Invalid node type: ${nodeType} for getChannels, expected team`
    );
  }

  const res = await client
    .api(`${parentResourcePath}/channels`)
    .select("id,displayName")
    .get();
  return res.value;
}

export async function getMessages(
  client: Client,
  parentInternalId: string
): Promise<MicrosoftGraph.Message[]> {
  const { nodeType, itemApiPath: parentResourcePath } =
    microsoftNodeDataFromInternalId(parentInternalId);

  if (nodeType !== "channel") {
    throw new Error(
      `Invalid node type: ${nodeType} for getMessages, expected channel`
    );
  }

  const res = await client.api(`${parentResourcePath}/messages`).get();
  return res.value;
}

export type MicrosoftNodeData = {
  nodeType: MicrosoftNodeType;
  itemApiPath: string;
};

export function microsoftInternalIdFromNodeData(nodeData: MicrosoftNodeData) {
  if (nodeData.nodeType === "sites-root") {
    return `microsoft/sites-root`;
  }
  if (nodeData.nodeType === "teams-root") {
    return `microsoft/teams-root`;
  }
  const { nodeType, itemApiPath } = nodeData;
  return `microsoft/${nodeType}/${itemApiPath}`;
}

export function microsoftNodeDataFromInternalId(
  internalId: string
): MicrosoftNodeData {
  if (internalId === "microsoft/sites-root") {
    return { nodeType: "sites-root", itemApiPath: "" };
  }

  if (internalId === "microsoft/teams-root") {
    return { nodeType: "teams-root", itemApiPath: "" };
  }

  const [, nodeType, ...resourcePathArr] = internalId.split("/");
  if (!nodeType || !isValidNodeType(nodeType)) {
    throw new Error(`Invalid internal id: ${internalId}`);
  }

  return { nodeType, itemApiPath: resourcePathArr.join("/") };
}
