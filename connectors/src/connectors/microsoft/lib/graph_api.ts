import { assertNever } from "@dust-tt/types";
import type { Client } from "@microsoft/microsoft-graph-client";
import type * as MicrosoftGraph from "@microsoft/microsoft-graph-types";

import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/types";
import type { MicrosoftNode } from "@connectors/connectors/microsoft/lib/types";
import { isValidNodeType } from "@connectors/connectors/microsoft/lib/types";

export async function getSites(client: Client): Promise<MicrosoftGraph.Site[]> {
  const res = await client.api("/sites?search=*").get();
  return res.value;
}

export async function getDrives(
  client: Client,
  parentInternalId: string
): Promise<MicrosoftGraph.Drive[]> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

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
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "drive" && nodeType !== "folder") {
    throw new Error(
      `Invalid node type: ${nodeType} for getFilesAndFolders, expected drive or folder`
    );
  }
  const endpoint =
    nodeType === "drive"
      ? `${parentResourcePath}/root/children`
      : `${parentResourcePath}/children`;

  const res = await client.api(endpoint).get();
  return res.value;
}

export async function getFolders(
  client: Client,
  parentInternalId: string
): Promise<MicrosoftGraph.DriveItem[]> {
  const res = await getFilesAndFolders(client, parentInternalId);
  return res.filter((item) => item.folder);
}

export async function getWorksheets(
  client: Client,
  internalId: string
): Promise<MicrosoftGraph.WorkbookWorksheet[]> {
  const { nodeType, itemAPIPath: itemApiPath } =
    typeAndPathFromInternalId(internalId);

  if (nodeType !== "file") {
    throw new Error(
      `Invalid node type: ${nodeType} for getWorksheets, expected file`
    );
  }

  const res = await client.api(`${itemApiPath}/workbook/worksheets`).get();
  return res.value;
}

export async function getWorksheetContent(
  client: Client,
  internalId: string
): Promise<MicrosoftGraph.WorkbookRange> {
  const { nodeType, itemAPIPath: itemApiPath } =
    typeAndPathFromInternalId(internalId);

  if (nodeType !== "worksheet") {
    throw new Error(
      `Invalid node type: ${nodeType} for getWorksheet content, expected worksheet`
    );
  }
  const res = await client.api(`${itemApiPath}/usedRange?$select=text`).get();
  return res;
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
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

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
): Promise<MicrosoftGraph.ChatMessage[]> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "channel") {
    throw new Error(
      `Invalid node type: ${nodeType} for getMessages, expected channel`
    );
  }

  const res = await client.api(`${parentResourcePath}/messages`).get();
  return res.value;
}

export async function getItem(client: Client, itemApiPath: string) {
  return client.api(itemApiPath).get();
}

type MicrosoftEntity = {
  folder: MicrosoftGraph.DriveItem;
  drive: MicrosoftGraph.Drive;
  site: MicrosoftGraph.Site;
  team: MicrosoftGraph.Team;
  file: MicrosoftGraph.DriveItem;
  page: MicrosoftGraph.DriveItem;
  channel: MicrosoftGraph.Channel;
  message: MicrosoftGraph.ChatMessage;
  worksheet: MicrosoftGraph.WorkbookWorksheet;
};

export type MicrosoftEntityMapping = {
  [K in keyof MicrosoftEntity]: MicrosoftEntity[K];
};

/**
 * Converts a Microsoft entity to a MicrosoftNode depending on the nodeType
 * Note: parentItemAPIPath is not set in the returned object, the parent logic
 * is not explicit in the Microsoft Graph API and is handled on our side
 * @param nodeType
 * @param itemRaw
 */
export function itemToMicrosoftNode<T extends keyof MicrosoftEntityMapping>(
  nodeType: T,
  itemRaw: MicrosoftEntityMapping[T]
): MicrosoftNode {
  switch (nodeType) {
    case "folder": {
      const item = itemRaw as MicrosoftGraph.DriveItem;
      return {
        nodeType,
        name: item.name ?? null,
        internalId: internalIdFromTypeAndPath({
          nodeType,
          itemAPIPath: getDriveItemAPIPath(item),
        }),
        parentInternalId: null,
        mimeType: null,
      };
    }
    case "file": {
      const item = itemRaw as MicrosoftGraph.DriveItem;
      return {
        nodeType,
        name: item.name ?? null,
        internalId: internalIdFromTypeAndPath({
          nodeType,
          itemAPIPath: getDriveItemAPIPath(item),
        }),
        parentInternalId: null,
        mimeType: item.file?.mimeType ?? null,
      };
    }
    case "drive": {
      const item = itemRaw as MicrosoftGraph.Drive;
      return {
        nodeType,
        name: item.name ?? null,
        internalId: internalIdFromTypeAndPath({
          nodeType,
          itemAPIPath: getDriveAPIPath(item),
        }),
        parentInternalId: null,
        mimeType: null,
      };
    }
    case "site": {
      const item = itemRaw as MicrosoftGraph.Site;
      return {
        nodeType,
        name: item.name ?? null,
        internalId: internalIdFromTypeAndPath({
          nodeType,
          itemAPIPath: getSiteAPIPath(item),
        }),
        mimeType: null,
        parentInternalId: null,
      };
    }
    case "team":
    case "channel":
    case "message":
    case "worksheet":
    case "page":
      throw new Error("Not implemented");
    default:
      assertNever(nodeType);
  }
}

export function internalIdFromTypeAndPath({
  nodeType,
  itemAPIPath,
}: {
  nodeType: MicrosoftNodeType;
  itemAPIPath: string;
}): string {
  let stringId = "";
  if (nodeType === "sites-root" || nodeType === "teams-root") {
    stringId = nodeType;
  } else {
    stringId = `${nodeType}/${itemAPIPath}`;
  }
  // encode to base64url so the internal id is URL-friendly
  return "microsoft-" + Buffer.from(stringId).toString("base64url");
}

export function typeAndPathFromInternalId(internalId: string): {
  nodeType: MicrosoftNodeType;
  itemAPIPath: string;
} {
  if (!internalId.startsWith("microsoft-")) {
    throw new Error(`Invalid internal id: ${internalId}`);
  }

  // decode from base64url
  const decodedId = Buffer.from(
    internalId.slice("microsoft-".length),
    "base64url"
  ).toString();

  if (decodedId === "sites-root" || decodedId === "teams-root") {
    return { nodeType: decodedId, itemAPIPath: "" };
  }

  const [nodeType, ...resourcePathArr] = decodedId.split("/");
  if (!nodeType || !isValidNodeType(nodeType)) {
    throw new Error(
      `Invalid internal id: ${decodedId} with nodeType: ${nodeType}`
    );
  }

  return { nodeType, itemAPIPath: resourcePathArr.join("/") };
}

export function getDriveItemAPIPath(item: MicrosoftGraph.DriveItem) {
  const { parentReference } = item;

  if (!parentReference?.driveId) {
    throw new Error("Unexpected: no drive id for item");
  }

  return `/drives/${parentReference.driveId}/items/${item.id}`;
}

export function getWorksheetAPIPath(
  item: MicrosoftGraph.WorkbookWorksheet,
  parentInternalId: string
) {
  const { nodeType, itemAPIPath: parentItemApiPath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "file") {
    throw new Error(`Invalid parent nodeType: ${nodeType}`);
  }

  return `${parentItemApiPath}/workbook/worksheets/${item.id}`;
}

export function getDriveAPIPath(drive: MicrosoftGraph.Drive) {
  return `/drives/${drive.id}`;
}

export function getSiteAPIPath(site: MicrosoftGraph.Site) {
  return `/sites/${site.id}`;
}
