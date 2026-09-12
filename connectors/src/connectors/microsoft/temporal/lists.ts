import {
  clientApiGet,
  getAllPaginatedEntities,
  getItem,
  getListItems,
} from "@connectors/connectors/microsoft/lib/graph_api";
import {
  formatFieldValue,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/utils";
import { isItemNotFoundError } from "@connectors/connectors/microsoft/temporal/cast_known_errors";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteDataSourceTable,
  upsertDataSourceTableFromCsv,
} from "@connectors/lib/data_sources";
import { TablesError } from "@connectors/lib/error";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import {
  cacheWithRedis,
  INTERNAL_MIME_TYPES,
  slugify,
} from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Client } from "@microsoft/microsoft-graph-client";
import type {
  ColumnDefinition,
  List,
  ListItem,
} from "@microsoft/microsoft-graph-types";
import { stringify } from "csv-stringify/sync";

// A SharePoint list is turned into a single structured table. Very large lists
// are skipped to protect the worker's memory and the tables backend, mirroring
// the Excel worksheet row cap.
const MAXIMUM_NUMBER_OF_LIST_ITEMS = 50000;

// SharePoint list `columns` include a large amount of internal plumbing. We keep
// the primary `Title` field plus author-created data columns, and drop the rest.
const LIST_COLUMN_NOISE = new Set([
  "ContentType",
  "Attachments",
  "Edit",
  "DocIcon",
  "LinkTitle",
  "LinkTitleNoMenu",
  "LinkTitle2",
  "ItemChildCount",
  "FolderChildCount",
  "AppAuthor",
  "AppEditor",
  "ComplianceAssetId",
  "_UIVersionString",
]);

export function isTableColumn(column: ColumnDefinition): boolean {
  if (!column.name) {
    return false;
  }
  // `Title` is the list's primary field and is read-only in the definition, but
  // it carries the main content, so keep it explicitly.
  if (column.name === "Title") {
    return true;
  }
  if (column.hidden || column.readOnly) {
    return false;
  }
  if (column.name.startsWith("_")) {
    return false;
  }
  if (column.columnGroup?.startsWith("_")) {
    return false;
  }
  return !LIST_COLUMN_NOISE.has(column.name);
}

async function getListColumnsForTable(
  logger: Logger,
  client: Client,
  listInternalId: string
): Promise<ColumnDefinition[]> {
  const { itemAPIPath } = typeAndPathFromInternalId(listInternalId);
  const res = await clientApiGet(logger, client, `${itemAPIPath}/columns`);
  const columns: ColumnDefinition[] = res.value;
  return columns.filter(isTableColumn);
}

// Person and Lookup columns only return their numeric id in the item `fields`,
// under a `<internalName>LookupId` key (e.g. `OwnerLookupId`, `refLookupId`).
// `LookupResolvers` maps a column's internal name to an id -> display-string map
// so those ids can be resolved back to human-readable values.
export type LookupResolvers = Record<string, Record<string, string>>;

export function isLookupLikeColumn(column: ColumnDefinition): boolean {
  return !!(column.lookup || column.personOrGroup);
}

// The `<name>LookupId` value is a single id or, for multi-value columns, an
// array of ids. Normalize both shapes to an array of string ids.
function normalizeLookupIds(raw: unknown): string[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .filter((v) => v !== null && v !== undefined)
    .map((v) => String(v));
}

export function listItemsToRows(
  columns: ColumnDefinition[],
  items: ListItem[],
  resolvers: LookupResolvers = {}
): string[][] {
  const header = columns.map((c) => c.displayName || c.name || "");
  const rows: string[][] = [header];
  for (const item of items) {
    const fields = (item.fields ?? {}) as Record<string, unknown>;
    rows.push(
      columns.map((c) => {
        if (!c.name) {
          return "";
        }
        if (isLookupLikeColumn(c)) {
          const ids = normalizeLookupIds(fields[`${c.name}LookupId`]);
          const idToValue = resolvers[c.name] ?? {};
          // Fall back to the raw id when a value could not be resolved, so the
          // reference is never silently dropped.
          const values = ids
            .map((id) => idToValue[id] ?? id)
            .filter((v) => v.length > 0);
          return values.join(", ");
        }
        return formatFieldValue(fields[c.name]) ?? "";
      })
    );
  }
  return rows;
}

async function fetchItemsAsMap(
  logger: Logger,
  client: Client,
  itemsEndpoint: string,
  valueGetter: (fields: Record<string, unknown>) => string | null
): Promise<Record<string, string>> {
  const items = await getAllPaginatedEntities<ListItem>(async (nextLink) => {
    const res = nextLink
      ? await clientApiGet(logger, client, nextLink)
      : await clientApiGet(logger, client, itemsEndpoint);
    const results: ListItem[] = res.value;
    return {
      results,
      nextLink: res["@odata.nextLink"],
    };
  });

  const map: Record<string, string> = {};
  for (const item of items) {
    if (item.id === null || item.id === undefined) {
      continue;
    }
    const value = valueGetter((item.fields ?? {}) as Record<string, unknown>);
    if (value !== null) {
      map[String(item.id)] = value;
    }
  }
  return map;
}

// The site's hidden "User Information List" maps person/group lookup ids to the
// actual users. Cached per site for the sync's duration.
const getUserInfoMap = cacheWithRedis(
  async ({
    logger,
    client,
    siteAPIPath,
  }: {
    logger: Logger;
    client: Client;
    siteAPIPath: string;
  }): Promise<Record<string, string>> => {
    const listsRes = await clientApiGet(
      logger,
      client,
      `${siteAPIPath}/lists?$select=id,name,displayName,list`
    );
    const lists: List[] = listsRes.value;
    const userList = lists.find(
      (l) =>
        l.list?.template === "userInformationList" ||
        l.displayName === "User Information List" ||
        l.name === "User Information List"
    );
    if (!userList?.id) {
      logger.warn(
        { siteAPIPath },
        "[List] User Information List not found; person columns will show ids."
      );
      return {};
    }
    return fetchItemsAsMap(
      logger,
      client,
      `${siteAPIPath}/lists/${userList.id}/items?$expand=fields($select=Title,EMail)`,
      (fields) =>
        formatFieldValue(fields.Title) ?? formatFieldValue(fields.EMail)
    );
  },
  ({ siteAPIPath }) => `microsoft-userinfo-${siteAPIPath}`,
  { ttlMs: 10 * 60 * 1000 }
);

// A lookup column references another list; resolve its ids to the value of the
// referenced column. Cached per (list, column) for the sync's duration.
const getLookupMap = cacheWithRedis(
  async ({
    logger,
    client,
    siteAPIPath,
    listId,
    columnName,
  }: {
    logger: Logger;
    client: Client;
    siteAPIPath: string;
    listId: string;
    columnName: string;
  }): Promise<Record<string, string>> =>
    fetchItemsAsMap(
      logger,
      client,
      `${siteAPIPath}/lists/${listId}/items?$expand=fields($select=${columnName})`,
      (fields) => formatFieldValue(fields[columnName])
    ),
  ({ siteAPIPath, listId, columnName }) =>
    `microsoft-lookup-${siteAPIPath}-${listId}-${columnName}`,
  { ttlMs: 10 * 60 * 1000 }
);

// Site API path for a list, e.g. "/sites/{siteId}" from the list's item path
// "/sites/{siteId}/lists/{listId}".
function siteAPIPathForList(listItemAPIPath: string): string {
  const marker = "/lists/";
  const idx = listItemAPIPath.indexOf(marker);
  return idx === -1 ? listItemAPIPath : listItemAPIPath.slice(0, idx);
}

async function buildLookupResolvers(
  logger: Logger,
  client: Client,
  listItemAPIPath: string,
  columns: ColumnDefinition[]
): Promise<LookupResolvers> {
  const siteAPIPath = siteAPIPathForList(listItemAPIPath);
  const resolvers: LookupResolvers = {};

  for (const column of columns) {
    if (!column.name) {
      continue;
    }
    try {
      if (column.personOrGroup) {
        resolvers[column.name] = await getUserInfoMap({
          logger,
          client,
          siteAPIPath,
        });
      } else if (column.lookup?.listId && column.lookup.columnName) {
        resolvers[column.name] = await getLookupMap({
          logger,
          client,
          siteAPIPath,
          listId: column.lookup.listId,
          columnName: column.lookup.columnName,
        });
      }
    } catch (err) {
      // Expected: the referenced list (or user information list) was deleted.
      // Fall back to raw ids for this column. Any other error (throttling,
      // transient upstream) must propagate so Temporal can retry.
      if (!isItemNotFoundError(err)) {
        throw err;
      }
      logger.warn(
        { column: column.name, error: err },
        "[List] Referenced list not found; using raw ids for column."
      );
    }
  }

  return resolvers;
}

async function upsertListTable(
  connector: ConnectorResource,
  listInternalId: string,
  list: List,
  rows: string[][]
): Promise<void> {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const listName = list.displayName || list.name || "Untitled list";
  const tableName = slugify(listName.substring(0, 32));
  const tableDescription = `Structured data from the SharePoint list "${listName}".`;
  const csv = stringify(rows);

  await upsertDataSourceTableFromCsv({
    dataSourceConfig,
    tableId: listInternalId,
    tableName,
    tableDescription,
    tableCsv: csv,
    loggerArgs: {
      connectorId: connector.id,
      listId: listInternalId,
    },
    truncate: true,
    // A list is a top-level selectable table: it is its own parent and has no
    // enclosing folder in the data source.
    parents: [listInternalId],
    parentId: null,
    title: listName,
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.LIST,
    sourceUrl: list.webUrl ?? undefined,
  });
}

async function upsertListInDb(
  connector: ConnectorResource,
  listInternalId: string,
  list: List
): Promise<void> {
  await MicrosoftNodeResource.upsert({
    internalId: listInternalId,
    connectorId: connector.id,
    lastSeenTs: new Date(),
    nodeType: "list" as const,
    name: list.displayName || list.name || "",
    mimeType: INTERNAL_MIME_TYPES.MICROSOFT.LIST,
    lastUpsertedTs: new Date(),
    // Lists are selected as roots; they have no synced parent node.
    parentInternalId: null,
    webUrl: list.webUrl ?? null,
  });
}

/**
 * Syncs a single SharePoint list into a Dust table.
 *
 * When `skipIfUnchanged` is set (incremental sync), the list is only re-synced
 * if its `lastModifiedDateTime` is newer than the last time we upserted it.
 * SharePoint bumps a list's `lastModifiedDateTime` when its items change, which
 * lets us avoid re-uploading unchanged lists on every incremental pass.
 */
export async function syncOneList({
  connectorId,
  client,
  listInternalId,
  skipIfUnchanged,
  localLogger,
  heartbeat,
}: {
  connectorId: ModelId;
  // The Graph client is passed in (rather than imported from the connector
  // index) to keep this module out of the index -> activities -> file -> lists
  // import cycle.
  client: Client;
  listInternalId: string;
  skipIfUnchanged: boolean;
  localLogger: Logger;
  heartbeat: () => Promise<void>;
}): Promise<Result<null, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector with id ${connectorId} not found`);
  }

  const { nodeType, itemAPIPath } = typeAndPathFromInternalId(listInternalId);
  if (nodeType !== "list") {
    return new Err(
      new Error(`Unexpected node type ${nodeType} for syncOneList`)
    );
  }

  const list = await getItem<List>(localLogger, client, itemAPIPath);

  if (skipIfUnchanged) {
    const existing = await MicrosoftNodeResource.fetchByInternalId(
      connectorId,
      listInternalId
    );
    // Skip the (full) re-upload when the list has not changed since we last
    // synced it. SharePoint bumps a list's `lastModifiedDateTime` when its items
    // change; comparing it against our last upsert time avoids re-uploading
    // unchanged lists on every incremental pass.
    const lastModified = list.lastModifiedDateTime
      ? new Date(list.lastModifiedDateTime).getTime()
      : null;
    const lastUpserted = existing?.lastUpsertedTs?.getTime() ?? null;
    if (
      lastModified !== null &&
      lastUpserted !== null &&
      lastModified <= lastUpserted
    ) {
      localLogger.info(
        { listInternalId },
        "[List] Skipping unchanged list on incremental sync."
      );
      return new Ok(null);
    }
  }

  localLogger.info({ listInternalId }, "[List] Syncing SharePoint list.");

  const columns = await getListColumnsForTable(
    localLogger,
    client,
    listInternalId
  );

  if (columns.length === 0) {
    localLogger.warn(
      { listInternalId },
      "[List] No usable columns found, skipping list."
    );
    return new Ok(null);
  }

  const items = await getAllPaginatedEntities<ListItem>(async (nextLink) => {
    await heartbeat();
    return getListItems(localLogger, client, listInternalId, nextLink);
  });

  if (items.length > MAXIMUM_NUMBER_OF_LIST_ITEMS) {
    // Deliberate cap, not a failure: skip the list without syncing (and without
    // recording a cursor, so it is retried if it shrinks).
    localLogger.info(
      { listInternalId, itemCount: items.length },
      `[List] List has more than ${MAXIMUM_NUMBER_OF_LIST_ITEMS} items, skipping.`
    );
    return new Ok(null);
  }

  await heartbeat();

  const resolvers = await buildLookupResolvers(
    localLogger,
    client,
    itemAPIPath,
    columns
  );

  const rows = listItemsToRows(columns, items, resolvers);

  try {
    await upsertListTable(connector, listInternalId, list, rows);
  } catch (err) {
    // A rejected upload (schema/size limits) is an expected, list-specific
    // failure: skip this list (without recording a cursor) rather than failing
    // the whole sync. Anything else (throttling, transient upstream, unexpected)
    // propagates to the activity boundary where it is thrown.
    if (err instanceof TablesError) {
      localLogger.warn(
        { listInternalId, error: err },
        "[List] Table upsert rejected, skipping list."
      );
      return new Ok(null);
    }
    throw err;
  }

  await upsertListInDb(connector, listInternalId, list);

  localLogger.info({ listInternalId }, "[List] Done.");
  return new Ok(null);
}

export async function deleteList(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  listInternalId: string
): Promise<void> {
  await deleteDataSourceTable({
    dataSourceConfig,
    tableId: listInternalId,
    loggerArgs: {
      connectorId,
      listId: listInternalId,
    },
  });
}
