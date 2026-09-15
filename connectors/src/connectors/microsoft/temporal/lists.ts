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
import {
  MicrosoftNodeResource,
  MicrosoftRootResource,
} from "@connectors/resources/microsoft_resource";
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
  valueGetter: (fields: Record<string, unknown>) => string | null,
  heartbeat: () => Promise<void>
): Promise<Record<string, string>> {
  const items = await getAllPaginatedEntities<ListItem>(async (nextLink) => {
    // The referenced list (User Information List / lookup target) can be large;
    // heartbeat per page so we don't trip the activity's heartbeat timeout.
    await heartbeat();
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
  // connectorId and startSyncTs are unused in the body but scope the cache key
  // below: per connector (so connectors sharing a site never read each other's
  // data) and per sync run (so every run rebuilds against current data, rather
  // than resolving new entities to raw ids from a stale cross-run cache).
  async ({
    logger,
    client,
    siteAPIPath,
    heartbeat,
  }: {
    logger: Logger;
    client: Client;
    connectorId: ModelId;
    startSyncTs: number;
    siteAPIPath: string;
    heartbeat: () => Promise<void>;
  }): Promise<Record<string, string>> => {
    // `system` must be selected for Graph to include system lists (the User
    // Information List is one); without it they are omitted and person columns
    // would fall back to numeric ids.
    const listsRes = await clientApiGet(
      logger,
      client,
      `${siteAPIPath}/lists?$select=id,name,displayName,list,system`
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
        formatFieldValue(fields.Title) ?? formatFieldValue(fields.EMail),
      heartbeat
    );
  },
  ({ connectorId, startSyncTs, siteAPIPath }) =>
    `microsoft-userinfo-${connectorId}-${siteAPIPath}-syncms-${startSyncTs}`,
  { ttlMs: 10 * 60 * 1000 }
);

// A lookup column references another list; resolve its ids to the value of the
// referenced column. Cached per (list, column) for the sync's duration.
const getLookupMap = cacheWithRedis(
  // connectorId and startSyncTs are unused in the body but scope the cache key
  // below (per connector, per sync run) — see getUserInfoMap.
  async ({
    logger,
    client,
    siteAPIPath,
    listId,
    columnName,
    heartbeat,
  }: {
    logger: Logger;
    client: Client;
    connectorId: ModelId;
    startSyncTs: number;
    siteAPIPath: string;
    listId: string;
    columnName: string;
    heartbeat: () => Promise<void>;
  }): Promise<Record<string, string>> =>
    fetchItemsAsMap(
      logger,
      client,
      `${siteAPIPath}/lists/${listId}/items?$expand=fields($select=${columnName})`,
      (fields) => formatFieldValue(fields[columnName]),
      heartbeat
    ),
  ({ connectorId, startSyncTs, siteAPIPath, listId, columnName }) =>
    `microsoft-lookup-${connectorId}-${siteAPIPath}-${listId}-${columnName}-syncms-${startSyncTs}`,
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
  connectorId: ModelId,
  startSyncTs: number,
  listItemAPIPath: string,
  columns: ColumnDefinition[],
  heartbeat: () => Promise<void>
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
          connectorId,
          startSyncTs,
          siteAPIPath,
          heartbeat,
        });
      } else if (column.lookup?.listId && column.lookup.columnName) {
        resolvers[column.name] = await getLookupMap({
          logger,
          client,
          connectorId,
          startSyncTs,
          siteAPIPath,
          listId: column.lookup.listId,
          columnName: column.lookup.columnName,
          heartbeat,
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
): Promise<Result<null, TablesError>> {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const listName = list.displayName || list.name || "Untitled list";
  const tableName = slugify(listName.substring(0, 32));
  const tableDescription = `Structured data from the SharePoint list "${listName}".`;
  const csv = stringify(rows);

  try {
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
  } catch (err) {
    // upsertDataSourceTableFromCsv throws TablesError for expected upload
    // rejections (e.g. CSV exceeding the size limit). Surface it as a typed
    // Result so the caller can skip the list; unexpected errors propagate.
    if (err instanceof TablesError) {
      return new Err(err);
    }
    throw err;
  }

  return new Ok(null);
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
  startSyncTs,
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
  // Timestamp identifying the current sync run; scopes the person/lookup
  // resolver caches so each run resolves against current data.
  startSyncTs: number;
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

  let list: List;
  try {
    list = await getItem<List>(localLogger, client, itemAPIPath);
  } catch (err) {
    // The list was deleted in SharePoint. List nodes are excluded from garbage
    // collection, so without this the activity would 404 forever and wedge the
    // whole list-sync loop. Treat it as a deletion: drop the table, the node and
    // the (now stale) root, then return successfully.
    if (isItemNotFoundError(err)) {
      localLogger.info(
        { listInternalId },
        "[List] List not found (deleted in SharePoint); removing."
      );
      await deleteList(
        dataSourceConfigFromConnector(connector),
        connectorId,
        listInternalId
      );
      const node = await MicrosoftNodeResource.fetchByInternalId(
        connectorId,
        listInternalId
      );
      await node?.delete();
      const root = await MicrosoftRootResource.fetchByInternalId(
        connectorId,
        listInternalId
      );
      await root?.delete();
      return new Ok(null);
    }
    throw err;
  }

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

  // Paginate manually (rather than via getAllPaginatedEntities) so we can stop
  // as soon as the list exceeds the cap, instead of materializing a very large
  // list fully in memory before bailing.
  const items: ListItem[] = [];
  let itemsNextLink: string | undefined;
  do {
    await heartbeat();
    const page = await getListItems(
      localLogger,
      client,
      listInternalId,
      itemsNextLink
    );
    items.push(...page.results);
    if (items.length > MAXIMUM_NUMBER_OF_LIST_ITEMS) {
      // Deliberate cap, not a failure: stop fetching and skip the list without
      // syncing (and without recording a cursor, so it is retried if it shrinks).
      localLogger.info(
        { listInternalId, itemCount: items.length },
        `[List] List has more than ${MAXIMUM_NUMBER_OF_LIST_ITEMS} items, skipping.`
      );
      return new Ok(null);
    }
    itemsNextLink = page.nextLink;
  } while (itemsNextLink);

  await heartbeat();

  const resolvers = await buildLookupResolvers(
    localLogger,
    client,
    connectorId,
    startSyncTs,
    itemAPIPath,
    columns,
    heartbeat
  );

  const rows = listItemsToRows(columns, items, resolvers);

  const upsertRes = await upsertListTable(
    connector,
    listInternalId,
    list,
    rows
  );
  if (upsertRes.isErr()) {
    // A rejected upload (schema/size limits) is an expected, list-specific
    // failure: skip this list (without recording a cursor) rather than failing
    // the whole sync. Unexpected errors propagate from upsertListTable to the
    // activity boundary where they are thrown.
    localLogger.warn(
      { listInternalId, error: upsertRes.error },
      "[List] Table upsert rejected, skipping list."
    );
    return new Ok(null);
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
