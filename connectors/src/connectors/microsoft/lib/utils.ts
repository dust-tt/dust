import type { LoggerInterface } from "@dust-tt/client";
import { cacheWithRedis } from "@dust-tt/types";
import type { Client } from "@microsoft/microsoft-graph-client";
import type {
  ColumnDefinition,
  DriveItem,
} from "@microsoft/microsoft-graph-types";

import { clientApiGet } from "@connectors/connectors/microsoft/lib/graph_api";

import type { MicrosoftNodeType } from "./types";
import { isValidNodeType } from "./types";

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

export function getDriveInternalIdFromItemId(itemId: string) {
  const { itemAPIPath } = typeAndPathFromInternalId(itemId);
  if (!itemAPIPath.startsWith("/drives/")) {
    throw new Error("Unexpected: no drive id for item");
  }
  const parts = itemAPIPath.split("/");
  return internalIdFromTypeAndPath({
    nodeType: "drive",
    itemAPIPath: `/drives/${parts[2]}`,
  });
}

async function getSiteLists(
  client: Client,
  siteId: string
): Promise<microsoftgraph.List[]> {
  const endpoint = `/sites/${siteId}/lists`;
  const res = await clientApiGet(client, endpoint);
  return res.value;
}

async function getSiteListByName(
  client: Client,
  siteId: string,
  listName: string
): Promise<microsoftgraph.List> {
  const lists = await getSiteLists(client, siteId);
  const list = lists.find((list) => list.name === listName);
  if (!list) {
    throw new Error(`List not found: ${listName}`);
  }
  return list;
}

// Parse DriveItem webUrl to get listName
// Eg: https://casquedelumiere.sharepoint.com/sites/casquedelumiere/Shared%20Documents/folder_with_txt/simple_txt.txt => the listName is "Shared Documents"
export const getListNameFromWebUrl = (webUrl: string) => {
  const url = new URL(webUrl);
  const pathParts = url.pathname.split("/");
  const sitesIndex = pathParts.findIndex((part) => part === "sites");
  if (sitesIndex === -1) {
    throw new Error(
      "Invalid webUrl format: missing sites segment, webUrl: " + webUrl
    );
  }
  const listNameEncoded = pathParts[sitesIndex + 2];
  if (!listNameEncoded) {
    throw new Error(
      "Invalid webUrl format: missing list name, webUrl: " + webUrl
    );
  }
  return decodeURIComponent(listNameEncoded);
};

const isCustomColumn = (column: ColumnDefinition) => {
  return (
    !column.readOnly && // Not read-only
    !column.hidden && // Not hidden
    column.name &&
    !column.name.startsWith("_") && // Not a system column (doesn't start with _)
    !column.columnGroup?.startsWith("_") &&
    ![
      "ID",
      "Title",
      "Created",
      "Modified",
      "Author",
      "Editor",
      "FileLeafRef",
      "LinkFilename",
      "ContentType",
      "PublishingStartDate",
      "PublishingEndDate",
      "PublishingExpirationDate",
      "PublishingPageImage",
      "PublishingPageLayout",
      "PublishingPageImageCaption",
      "PublishingPageImageDescription",
    ].includes(column.name)
  ); // Not a standard column
};

export const getCachedListColumns = cacheWithRedis(
  _getListColumns,
  ({ siteId, listName }) => {
    return `${siteId}-${listName}`;
  },
  60 * 10 * 1000 // 10 minutes
);

export async function _getListColumns({
  client,
  siteId,
  listName,
}: {
  client: Client;
  siteId: string;
  listName: string;
}): Promise<microsoftgraph.ColumnDefinition[]> {
  const list = await getSiteListByName(client, siteId, listName);

  const endpoint = `/sites/${siteId}/lists/${list.id}/columns`;
  const res = await clientApiGet(client, endpoint);
  return res.value.filter(isCustomColumn);
}

// Turn the labels into a string array of formatted string such as column.displayName:value
export const getColumnsFromListItem = async (
  file: DriveItem,
  client: Client,
  logger: LoggerInterface
) => {
  const listItem = file.listItem;
  if (
    !listItem ||
    !listItem.parentReference?.siteId ||
    !listItem.webUrl ||
    !listItem.fields
  ) {
    return [];
  }
  try {
    const listName = getListNameFromWebUrl(listItem.webUrl);
    const columns = await getCachedListColumns({
      client,
      listName,
      siteId: listItem.parentReference.siteId,
    });

    const columnsList: string[] = [];

    const fields = listItem.fields as Record<string, unknown>;
    for (const [k, v] of Object.entries(fields)) {
      const column = columns.find((column) => column.name === k);
      if (column) {
        columnsList.push(`${column.displayName}:${v}`);
      }
    }
    return columnsList;
  } catch (e) {
    logger.error({ error: e }, "Error while getting columns from list item.");
    return [];
  }
};
