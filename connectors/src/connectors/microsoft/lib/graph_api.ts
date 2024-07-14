import { assertNever } from "@dust-tt/types";
import type { Client } from "@microsoft/microsoft-graph-client";
import type * as MicrosoftGraph from "@microsoft/microsoft-graph-types";

import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/types";
import type { MicrosoftNode } from "@connectors/connectors/microsoft/lib/types";
import { isValidNodeType } from "@connectors/connectors/microsoft/lib/types";

export async function getSites(
  client: Client,
  nextLink?: string
): Promise<{ results: MicrosoftGraph.Site[]; nextLink?: string }> {
  const res = nextLink
    ? await client.api(nextLink).get()
    : await client.api("/sites?search=*").get();
  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }
  return { results: res.value };
}

export async function getDrives(
  client: Client,
  parentInternalId: string,
  nextLink?: string
): Promise<{ results: MicrosoftGraph.Drive[]; nextLink?: string }> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "site") {
    throw new Error(
      `Invalid node type: ${nodeType} for getDrives, expected site`
    );
  }

  const res = nextLink
    ? await client.api(nextLink).get()
    : await client.api(`${parentResourcePath}/drives`).get();

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

export async function getFilesAndFolders(
  client: Client,
  parentInternalId: string,
  nextLink?: string
): Promise<{ results: MicrosoftGraph.DriveItem[]; nextLink?: string }> {
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

  const res = nextLink
    ? await client.api(nextLink).get()
    : await client.api(endpoint).get();

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

export async function getWorksheets(
  client: Client,
  internalId: string,
  nextLink?: string
): Promise<{
  results: MicrosoftGraph.WorkbookWorksheet[];
  nextLink?: string;
}> {
  const { nodeType, itemAPIPath: itemApiPath } =
    typeAndPathFromInternalId(internalId);

  if (nodeType !== "file") {
    throw new Error(
      `Invalid node type: ${nodeType} for getWorksheets, expected file`
    );
  }

  const res = nextLink
    ? await client.api(nextLink).get()
    : await client.api(`${itemApiPath}/workbook/worksheets`).get();

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
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

export async function getTeams(
  client: Client,
  nextLink?: string
): Promise<{ results: MicrosoftGraph.Team[]; nextLink?: string }> {
  const res = nextLink
    ? await client.api(nextLink).get()
    : await client.api("/me/joinedTeams").get();

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

export async function getChannels(
  client: Client,
  parentInternalId: string,
  nextLink?: string
): Promise<{ results: MicrosoftGraph.Channel[]; nextLink?: string }> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "team") {
    throw new Error(
      `Invalid node type: ${nodeType} for getChannels, expected team`
    );
  }

  const res = nextLink
    ? await client.api(nextLink).get()
    : await client.api(`${parentResourcePath}/channels`).get();

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

export async function getMessages(
  client: Client,
  parentInternalId: string,
  nextLink?: string
): Promise<{ results: MicrosoftGraph.ChatMessage[]; nextLink?: string }> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "channel") {
    throw new Error(
      `Invalid node type: ${nodeType} for getMessages, expected channel`
    );
  }

  const res = nextLink
    ? await client.api(nextLink).get()
    : await client.api(parentResourcePath).get();

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}
/**
 * Given a getter function with a single nextLink optional parameter, this function
 * fetches all items by following nextLinks
 */
export async function getAllPaginatedEntities<T extends MicrosoftGraph.Entity>(
  getEntitiesFn: (
    nextLink?: string
  ) => Promise<{ results: T[]; nextLink?: string }>
): Promise<T[]> {
  let nextLink: string | undefined = undefined;
  let allItems: T[] = [];

  do {
    const { results, nextLink: newNextLink } = await getEntitiesFn(nextLink);
    allItems = allItems.concat(results);
    nextLink = newNextLink;
  } while (nextLink);

  return allItems;
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
