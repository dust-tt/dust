import type { LoggerInterface } from "@dust-tt/client";
import type { Client } from "@microsoft/microsoft-graph-client";
import type {
  ColumnDefinition,
  FieldValueSet,
  NullableOption,
} from "@microsoft/microsoft-graph-types";

import { clientApiGet } from "@connectors/connectors/microsoft/lib/graph_api";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import { cacheWithRedis } from "@connectors/types";

import type { DriveItem, MicrosoftNodeType } from "./types";
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
  ({ siteId, listId }) => {
    return `${siteId}-${listId}`;
  },
  {
    ttlMs: 60 * 10 * 1000, // 10 minutes
  }
);

export async function _getListColumns({
  logger,
  client,
  siteId,
  listId,
}: {
  logger: LoggerInterface;
  client: Client;
  siteId: string;
  listId: string;
}): Promise<ColumnDefinition[]> {
  const endpoint = `/sites/${siteId}/lists/${listId}/columns`;
  const res = await clientApiGet(logger, client, endpoint);
  return res.value.filter(isCustomColumn);
}

// Turn the labels into a string array of formatted string such as column.displayName:value
export const getColumnsFromListItem = async (
  file: DriveItem,
  fields: NullableOption<FieldValueSet> | undefined,
  client: Client,
  logger: LoggerInterface
) => {
  const listItem = file.listItem;
  if (!file.sharepointIds?.listId || !file.sharepointIds?.siteId || !fields) {
    logger.info(
      {
        file,
        listItem,
      },
      "No list item or sharepointIds or fields found"
    );
    return [];
  }
  try {
    const columns = await getCachedListColumns({
      logger,
      client,
      listId: file.sharepointIds.listId,
      siteId: file.sharepointIds.siteId,
    });

    const columnsList: string[] = [];

    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
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

export const markInternalIdAsSkipped = async ({
  internalId,
  connectorId,
  parentInternalId,
  reason = "blacklisted",
  file,
}: {
  internalId: string;
  connectorId: number;
  parentInternalId?: string;
  reason?: string;
  file: DriveItem;
}) => {
  const existingFile = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    internalId
  );

  if (existingFile) {
    await existingFile.update({
      skipReason: reason,
    });
  } else {
    await MicrosoftNodeResource.makeNew({
      internalId: internalId,
      connectorId: connectorId,
      nodeType: "file",
      name: file.name ?? "unknown",
      mimeType: file.file?.mimeType ?? "unknown",
      parentInternalId,
      skipReason: reason,
      webUrl: file.webUrl ?? null,
    });
  }
};
