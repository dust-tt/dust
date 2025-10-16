import type { LoggerInterface, Result } from "@dust-tt/client";
import { assertNever, Err, Ok } from "@dust-tt/client";
import type { Client } from "@microsoft/microsoft-graph-client";
import { GraphError } from "@microsoft/microsoft-graph-client";
import type {
  BaseItem,
  Channel,
  ChatMessage,
  Drive,
  Entity,
  ItemReference,
  Organization,
  Site,
  Team,
  WorkbookRange,
  WorkbookWorksheet,
} from "@microsoft/microsoft-graph-types";

import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import type { MicrosoftNode } from "@connectors/connectors/microsoft/lib/types";
import { DRIVE_ITEM_EXPANDS_AND_SELECTS } from "@connectors/connectors/microsoft/lib/types";
import {
  internalIdFromTypeAndPath,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/utils";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { normalizeError } from "@connectors/types";

export async function clientApiGet(
  logger: LoggerInterface,
  client: Client,
  endpoint: string
) {
  try {
    const start = new Date();
    const res = await client.api(endpoint).get();
    const end = new Date();
    const duration = end.getTime() - start.getTime();
    logger.info({ duration, endpoint }, `Graph API call took ${duration}ms`);
    return res;
  } catch (error) {
    logger.error({ error, endpoint }, `Graph API call threw an error`);
    if (
      error instanceof GraphError &&
      error.message.includes("Access denied")
    ) {
      throw new ExternalOAuthTokenError(error);
    }
    throw error;
  }
}

export async function clientApiPost(
  logger: LoggerInterface,
  client: Client,
  endpoint: string,
  content: any // eslint-disable-line @typescript-eslint/no-explicit-any
) {
  try {
    const start = new Date();
    const res = await client.api(endpoint).post(content);
    const end = new Date();
    const duration = end.getTime() - start.getTime();
    logger.info({ duration, endpoint }, `Graph API call took ${duration}ms`);
    return res;
  } catch (error) {
    logger.error({ error, endpoint }, `Graph API call threw an error`);
    if (
      error instanceof GraphError &&
      error.message.includes("Access denied")
    ) {
      throw new ExternalOAuthTokenError(error);
    }
    throw error;
  }
}

export async function getSites(
  logger: LoggerInterface,
  client: Client,
  nextLink?: string
): Promise<{ results: Site[]; nextLink?: string }> {
  const res = nextLink
    ? await clientApiGet(logger, client, nextLink)
    : await clientApiGet(logger, client, "/sites?search=*");

  const results = res.value.filter((site: Site) => site.root);
  if ("@odata.nextLink" in res) {
    return {
      results,
      nextLink: res["@odata.nextLink"],
    };
  }
  return { results };
}

export async function getSubSites(
  logger: LoggerInterface,
  client: Client,
  parentInternalId: string,
  nextLink?: string
): Promise<{ results: Site[]; nextLink?: string }> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "site") {
    throw new Error(
      `Invalid node type: ${nodeType} for getSubSites, expected site`
    );
  }

  const res = nextLink
    ? await clientApiGet(logger, client, nextLink)
    : await clientApiGet(logger, client, `${parentResourcePath}/sites`);
  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }
  return { results: res.value };
}

export async function getDrives(
  logger: LoggerInterface,
  client: Client,
  parentInternalId: string,
  nextLink?: string
): Promise<{ results: Drive[]; nextLink?: string }> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "site") {
    throw new Error(
      `Invalid node type: ${nodeType} for getDrives, expected site`
    );
  }

  const res = nextLink
    ? await clientApiGet(logger, client, nextLink)
    : await clientApiGet(logger, client, `${parentResourcePath}/drives`);

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

export async function getFilesAndFolders(
  logger: LoggerInterface,
  client: Client,
  parentInternalId: string,
  nextLink?: string
): Promise<{ results: DriveItem[]; nextLink?: string }> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "drive" && nodeType !== "folder") {
    throw new Error(
      `Invalid node type: ${nodeType} for getFilesAndFolders, expected drive or folder`
    );
  }

  const endpoint =
    nodeType === "drive"
      ? `${parentResourcePath}/root/children?${DRIVE_ITEM_EXPANDS_AND_SELECTS}`
      : `${parentResourcePath}/children?${DRIVE_ITEM_EXPANDS_AND_SELECTS}`;

  const res = nextLink
    ? await clientApiGet(logger, client, nextLink)
    : await clientApiGet(logger, client, endpoint);

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

/**
 *  Get list of items that have changed Calling without nextLink nor token will
 * result in initial delta call
 */
export async function getDeltaResults({
  logger,
  client,
  parentInternalId,
  nextLink,
  token,
}: {
  logger: LoggerInterface;
  client: Client;
  parentInternalId: string;
} & (
  | { nextLink?: string; token?: never }
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
  logger.info(
    { parentInternalId, itemAPIPath, nextLink, token },
    "Getting delta"
  );
  const deltaPath =
    (nodeType === "folder"
      ? `${itemAPIPath}/delta?${DRIVE_ITEM_EXPANDS_AND_SELECTS}`
      : `${itemAPIPath}/root/delta?${DRIVE_ITEM_EXPANDS_AND_SELECTS}`) +
    (token ? `&token=${token}` : "");

  const res = nextLink
    ? await clientApiGet(logger, client, nextLink)
    : await clientApiGet(logger, client, deltaPath);

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
export async function getFullDeltaResults({
  logger,
  client,
  parentInternalId,
  initialDeltaLink,
  heartbeatFunction,
}: {
  logger: LoggerInterface;
  client: Client;
  parentInternalId: string;
  initialDeltaLink?: string;
  heartbeatFunction: () => void;
}): Promise<{ results: DriveItem[]; deltaLink: string }> {
  let nextLink: string | undefined = initialDeltaLink;
  let allItems: DriveItem[] = [];
  let deltaLink: string | undefined = undefined;

  do {
    const {
      results,
      nextLink: newNextLink,
      deltaLink: finalDeltaLink,
    } = await getDeltaResults({ logger, client, parentInternalId, nextLink });
    allItems = allItems.concat(results);
    nextLink = newNextLink;
    deltaLink = finalDeltaLink;
    heartbeatFunction();
  } while (nextLink);

  if (!deltaLink) {
    throw new Error("Delta link not found");
  }

  return { results: allItems, deltaLink };
}

export async function getWorksheets(
  logger: LoggerInterface,
  client: Client,
  internalId: string,
  nextLink?: string
): Promise<{
  results: WorkbookWorksheet[];
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
    ? await clientApiGet(logger, client, nextLink)
    : await clientApiGet(logger, client, `${itemApiPath}/workbook/worksheets`);

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

export async function getWorksheetContent(
  logger: LoggerInterface,
  client: Client,
  internalId: string
): Promise<WorkbookRange> {
  const { nodeType, itemAPIPath: itemApiPath } =
    typeAndPathFromInternalId(internalId);

  if (nodeType !== "worksheet") {
    throw new Error(
      `Invalid node type: ${nodeType} for getWorksheet content, expected worksheet`
    );
  }
  const res = await clientApiGet(
    logger,
    client,
    `${itemApiPath}/usedRange?$select=text`
  );
  return res;
}

export async function getTeams(
  logger: LoggerInterface,
  client: Client,
  nextLink?: string
): Promise<{ results: Team[]; nextLink?: string }> {
  const res = nextLink
    ? await clientApiGet(logger, client, nextLink)
    : await clientApiGet(logger, client, "/me/joinedTeams");

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

export async function getChannels(
  logger: LoggerInterface,
  client: Client,
  parentInternalId: string,
  nextLink?: string
): Promise<{ results: Channel[]; nextLink?: string }> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "team") {
    throw new Error(
      `Invalid node type: ${nodeType} for getChannels, expected team`
    );
  }

  const res = nextLink
    ? await clientApiGet(logger, client, nextLink)
    : await clientApiGet(logger, client, `${parentResourcePath}/channels`);

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

export async function getMessages(
  logger: LoggerInterface,
  client: Client,
  parentInternalId: string,
  nextLink?: string
): Promise<{ results: ChatMessage[]; nextLink?: string }> {
  const { nodeType, itemAPIPath: parentResourcePath } =
    typeAndPathFromInternalId(parentInternalId);

  if (nodeType !== "channel") {
    throw new Error(
      `Invalid node type: ${nodeType} for getMessages, expected channel`
    );
  }

  const res = nextLink
    ? await clientApiGet(logger, client, nextLink)
    : await clientApiGet(logger, client, parentResourcePath);

  if ("@odata.nextLink" in res) {
    return {
      results: res.value,
      nextLink: res["@odata.nextLink"],
    };
  }

  return { results: res.value };
}

export async function getMessagesFromConversation(
  logger: LoggerInterface,
  client: Client,
  conversationId: string
): Promise<{ results: ChatMessage[]; nextLink?: string }> {
  const res = await clientApiGet(
    logger,
    client,
    `/chats/${conversationId}/messages?$top=50&$orderBy=createdDateTime desc`
  );

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
export async function getAllPaginatedEntities<T extends Entity>(
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

export async function getItem<T extends Entity>(
  logger: LoggerInterface,
  client: Client,
  itemApiPath: string
): Promise<T> {
  return clientApiGet(logger, client, itemApiPath);
}

type MicrosoftEntity = {
  folder: DriveItem;
  drive: Drive;
  site: Site;
  team: Team;
  file: DriveItem;
  page: DriveItem;
  channel: Channel;
  message: ChatMessage;
  worksheet: WorkbookWorksheet;
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
      const item = itemRaw as DriveItem;
      return {
        nodeType,
        name: item.name ?? null,
        internalId: getDriveItemInternalId(item),
        parentInternalId: null,
        mimeType: null,
        webUrl: item.webUrl ?? null,
      };
    }
    case "file": {
      const item = itemRaw as DriveItem;
      return {
        nodeType,
        name: item.name ?? null,
        internalId: getDriveItemInternalId(item),
        parentInternalId: null,
        mimeType: item.file?.mimeType ?? null,
        webUrl: item.webUrl ?? null,
      };
    }
    case "drive": {
      const item = itemRaw as Drive;
      return {
        nodeType,
        name: item.name ?? "unknown",
        internalId: getDriveInternalId(item),
        parentInternalId: null,
        mimeType: null,
        webUrl: item.webUrl ?? null,
      };
    }
    case "site": {
      const item = itemRaw as Site;
      return {
        nodeType,
        name: item.name ?? null,
        internalId: internalIdFromTypeAndPath({
          nodeType,
          itemAPIPath: getSiteAPIPath(item),
        }),
        mimeType: null,
        parentInternalId: null,
        webUrl: item.webUrl ?? null,
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

export function getDriveItemInternalId(item: DriveItem) {
  const { parentReference } = item;

  if (!parentReference?.driveId) {
    throw new Error("Unexpected: no drive id for item");
  }

  const nodeType = item.folder ? "folder" : item.file ? "file" : null;

  if (!nodeType) {
    throw new Error("Unexpected: item is neither folder nor file");
  }

  return internalIdFromTypeAndPath({
    nodeType,
    itemAPIPath: `/drives/${parentReference.driveId}/items/${item.id}`,
  });
}

export function getParentReferenceInternalId(parentReference: ItemReference) {
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
  item: WorkbookWorksheet,
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

export function getDriveInternalId(drive: Drive) {
  return internalIdFromTypeAndPath({
    nodeType: "drive",
    itemAPIPath: `/drives/${drive.id}`,
  });
}

export function getDriveInternalIdFromItem(item: DriveItem) {
  if (!item.parentReference?.driveId) {
    throw new Error("Unexpected: no drive id for item");
  }

  return internalIdFromTypeAndPath({
    nodeType: "drive",
    itemAPIPath: `/drives/${item.parentReference.driveId}`,
  });
}

export function getSiteAPIPath(site: Site) {
  return `/sites/${site.id}`;
}

export async function wrapMicrosoftGraphAPIWithResult<T>(
  fn: () => Promise<T>
): Promise<Result<T, Error>> {
  try {
    return new Ok(await fn());
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export function extractPath(item: BaseItem) {
  const webUrl = item.webUrl;
  if (webUrl) {
    return decodeURI(webUrl);
  } else {
    return "unknown";
  }
}

export async function getOrganization(
  logger: LoggerInterface,
  client: Client
): Promise<Organization> {
  const org = await clientApiGet(logger, client, "/organization");
  if (!org.value || !org.value[0] || !org.value[0]) {
    throw new Error("Unexpected: no organization found");
  }

  return org.value[0];
}
