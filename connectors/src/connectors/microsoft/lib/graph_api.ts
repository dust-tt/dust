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

export async function getDeltaResults({
  client,
  parentInternalId,
  nextLink,
  token,
}: {
  client: Client;
  parentInternalId: string;
} & (
  | { nextLink: string; token?: never }
  | { nextLink?: never; token: string }
)) {
  const { nodeType, itemAPIPath } = typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "drive" && nodeType !== "folder") {
    throw new Error(
      `Invalid node type: ${nodeType} for delta, expected drive or folder`
    );
  }

  if (nextLink && token) {
    throw new Error("nextLink and token cannot be used together");
  }

  const deltaPath =
    (nodeType === "folder"
      ? itemAPIPath + "/delta"
      : itemAPIPath + "/root/delta") + (token ? `?token=${token}` : "");

  const res = nextLink
    ? await client.api(nextLink).get()
    : await client
        .api(deltaPath)
        .header("Prefer", "odata.track-changes, deltaExcludeParent=true")
        .get();

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  if ("@odata.deltaLink" in res) {
    return {
      results: res.value,
      deltaLink: res["@odata.deltaLink"],
    };
  }

  return { results: res.value };
}

/**
 * Similar to getDeltaResults but goes through pagination (returning results and
 * the deltalink)
 */
export async function getFullDeltaResults(
  client: Client,
  parentInternalId: string,
  initialDeltaLink: string
): Promise<{ results: microsoftgraph.DriveItem[]; deltaLink: string }> {
  let nextLink: string | undefined = initialDeltaLink;
  let allItems: microsoftgraph.DriveItem[] = [];
  let deltaLink: string | undefined = undefined;

  do {
    const {
      results,
      nextLink: newNextLink,
      deltaLink: finalDeltaLink,
    } = await getDeltaResults({ client, parentInternalId, nextLink });
    allItems = allItems.concat(results);
    nextLink = newNextLink;
    deltaLink = finalDeltaLink;
  } while (nextLink);

  if (!deltaLink) {
    throw new Error("Delta link not found");
  }

  return { results: allItems, deltaLink };
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

export async function getFileDownloadURL(client: Client, internalId: string) {
  const { nodeType, itemAPIPath } = typeAndPathFromInternalId(internalId);

  if (nodeType !== "file") {
    throw new Error(`Invalid node type: ${nodeType} for getFileDownloadURL`);
  }

  const res = await client.api(`${itemAPIPath}`).get();

  return res["@microsoft.graph.downloadUrl"];
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
        internalId: getDriveItemInternalId(item),
        parentInternalId: item.parentReference
          ? getParentReferenceInternalId(item.parentReference)
          : null,
        mimeType: null,
      };
    }
    case "file": {
      const item = itemRaw as MicrosoftGraph.DriveItem;
      return {
        nodeType,
        name: item.name ?? null,
        internalId: getDriveItemInternalId(item),
        parentInternalId: item.parentReference
          ? getParentReferenceInternalId(item.parentReference)
          : null,
        mimeType: item.file?.mimeType ?? null,
      };
    }
    case "drive": {
      const item = itemRaw as MicrosoftGraph.Drive;
      return {
        nodeType,
        name: item.name ?? null,
        internalId: getDriveInternalId(item),
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

export function getDriveItemInternalId(item: MicrosoftGraph.DriveItem) {
  const { parentReference } = item;

  if (!parentReference?.driveId) {
    throw new Error("Unexpected: no drive id for item");
  }

  const nodeType = item.folder ? "folder" : item.file ? "file" : null;

  if (!nodeType) {
    throw new Error("Unexpected: item is neither folder nor file");
  }

  if (item.root) {
    return internalIdFromTypeAndPath({
      nodeType: "drive",
      itemAPIPath: `/drives/${parentReference.driveId}`,
    });
  }

  return internalIdFromTypeAndPath({
    nodeType,
    itemAPIPath: `/drives/${parentReference.driveId}/items/${item.id}`,
  });
}

export function getParentReferenceInternalId(
  parentReference: MicrosoftGraph.ItemReference
) {
  if (!parentReference.driveId) {
    throw new Error("Unexpected: no drive id for item");
  }

  if (parentReference.path && !parentReference.path.endsWith("root:")) {
    return internalIdFromTypeAndPath({
      nodeType: "folder",
      itemAPIPath: `/drives/${parentReference.driveId}/items/${parentReference.id}`,
    });
  }

  return internalIdFromTypeAndPath({
    nodeType: "drive",
    itemAPIPath: `/drives/${parentReference.driveId}`,
  });
}

export function getWorksheetInternalId(
  item: MicrosoftGraph.WorkbookWorksheet,
  parentInternalId: string
) {
  const { nodeType, itemAPIPath: parentItemApiPath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "file") {
    throw new Error(`Invalid parent nodeType: ${nodeType}`);
  }

  return internalIdFromTypeAndPath({
    itemAPIPath: `${parentItemApiPath}/workbook/worksheets/${item.id}`,
    nodeType: "worksheet",
  });
}

export function getDriveInternalId(drive: MicrosoftGraph.Drive) {
  return internalIdFromTypeAndPath({
    nodeType: "drive",
    itemAPIPath: `/drives/${drive.id}`,
  });
}

export function getDriveInternalIdFromItem(item: MicrosoftGraph.DriveItem) {
  if (!item.parentReference?.driveId) {
    throw new Error("Unexpected: no drive id for item");
  }

  return internalIdFromTypeAndPath({
    nodeType: "drive",
    itemAPIPath: `/drives/${item.parentReference.driveId}`,
  });
}

export function getSiteAPIPath(site: MicrosoftGraph.Site) {
  return `/sites/${site.id}`;
}
