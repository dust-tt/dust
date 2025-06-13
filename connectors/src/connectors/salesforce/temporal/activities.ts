import type { Record } from "jsforce";

import {
  fetchTree,
  runSOQL,
} from "@connectors/connectors/salesforce/lib/salesforce_api";
import {
  getConnectorAndCredentials,
  syncQueryTemplateInterpolate,
} from "@connectors/connectors/salesforce/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  renderDocumentTitleAndContent,
  upsertDataSourceDocument,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import { sync } from "@connectors/lib/remote_databases/activities";
import { parseInternalId } from "@connectors/lib/remote_databases/utils";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { SalesforceSyncedQueryResource } from "@connectors/resources/salesforce_resources";
import type { DateString, ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

export async function syncSalesforceConnection(connectorId: ModelId) {
  const connAndCredsRes = await getConnectorAndCredentials(connectorId);
  if (connAndCredsRes.isErr()) {
    throw connAndCredsRes.error;
  }

  await syncStarted(connectorId);

  const { credentials, connector } = connAndCredsRes.value;

  const treeRes = await fetchTree({ credentials });
  if (treeRes.isErr()) {
    throw treeRes.error;
  }
  const tree = treeRes.value;

  await sync({
    remoteDBTree: tree,
    mimeTypes: INTERNAL_MIME_TYPES.SALESFORCE,
    connector,
    // Only keep the table name in the remote table id.
    internalTableIdToRemoteTableId: (internalTableId: string) =>
      parseInternalId(internalTableId).tableName ?? internalTableId,
    tags: [],
  });

  await syncSucceeded(connectorId);
}

// Discover all Salesforce synced queries for a given connector.
export async function discoverSalesforceSyncedQueries(
  connectorId: ModelId
): Promise<{ id: ModelId; lastSeenModifiedDate: Date | null }[]> {
  const connAndCredsRes = await getConnectorAndCredentials(connectorId);
  if (connAndCredsRes.isErr()) {
    throw connAndCredsRes.error;
  }

  const { connector } = connAndCredsRes.value;

  const queries =
    await SalesforceSyncedQueryResource.fetchByConnector(connector);

  return queries.map((query) => {
    return {
      id: query.id,
      lastSeenModifiedDate: query.lastSeenModifiedDate ?? null,
    };
  });
}

function folderIdForSyncedQuery(
  connectorId: ModelId,
  queryId: ModelId
): string {
  return `salesforce-synced-query-folder-${connectorId}-${queryId}`;
}

function documentIdForSyncedQuery(
  connectorId: ModelId,
  queryId: ModelId,
  record: Record
): string {
  if (!record.Id || typeof record.Id !== "string") {
    throw new Error(`Salesforce Record must have a valid Id field.`);
  }
  return `salesforce-synced-query-document-${connectorId}-${queryId}-${record.Id}`;
}

// Upsert the root node for the synced query and returns its nodeId.
export async function upsertSyncedQueryRootNode(
  connectorId: ModelId,
  {
    queryId,
  }: {
    queryId: ModelId;
  }
) {
  const connAndCredsRes = await getConnectorAndCredentials(connectorId);
  if (connAndCredsRes.isErr()) {
    throw connAndCredsRes.error;
  }

  const { connector } = connAndCredsRes.value;
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  // Fetch the synced query resource
  const syncedQuery = await SalesforceSyncedQueryResource.fetchById(queryId);
  if (!syncedQuery) {
    throw new Error(`Synced query with id ${queryId} not found.`);
  }
  if (syncedQuery.connectorId !== connectorId) {
    throw new Error(
      `Synced query with id ${queryId} does not belong to connector ${connectorId}.`
    );
  }

  const folderId = folderIdForSyncedQuery(connectorId, queryId);

  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId,
    title: syncedQuery.rootNodeName,
    parentId: null,
    parents: [folderId],
    mimeType: INTERNAL_MIME_TYPES.SALESFORCE.SYNCED_QUERY_FOLDER,
  });

  return folderId;
}

// Syncs one page of results from a Salesforce query as defined by pagination arguments offset and
// limit. Stops as soon as a record.lastModifiedDate is smaller than upToLastModifiedDate (if
// defined) or there is no record remaining to sync. Returns the lastModifiedDate seen so far.
export async function processSyncedQueryPage(
  connectorId: ModelId,
  {
    queryId,
    lastModifiedDateStringCursor,
    limit,
    lastSeenModifiedDateString,
    upToLastModifiedDateString,
  }: {
    queryId: ModelId;
    lastModifiedDateStringCursor: DateString;
    limit: number;
    lastSeenModifiedDateString: DateString;
    upToLastModifiedDateString: DateString;
  }
): Promise<{
  // The most recent lastModifiedDate seen
  lastSeenModifiedDateString: DateString;
  // The older lastModifiedDate seen in this page to use for pagination
  lastModifiedDateStringCursor: DateString;
  hasMore: boolean;
  count: number;
}> {
  let lastSeenModifiedDate = lastSeenModifiedDateString
    ? new Date(lastSeenModifiedDateString)
    : null;
  let lastModifiedDateCursor = lastModifiedDateStringCursor
    ? new Date(lastModifiedDateStringCursor)
    : null;
  const upToLastModifiedDate = upToLastModifiedDateString
    ? new Date(upToLastModifiedDateString)
    : null;

  const connAndCredsRes = await getConnectorAndCredentials(connectorId);
  if (connAndCredsRes.isErr()) {
    throw connAndCredsRes.error;
  }

  const { credentials, connector } = connAndCredsRes.value;
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  // Fetch the synced query resource
  const syncedQuery = await SalesforceSyncedQueryResource.fetchById(queryId);
  if (!syncedQuery) {
    throw new Error(`Synced query with id ${queryId} not found.`);
  }
  if (syncedQuery.connectorId !== connectorId) {
    throw new Error(
      `Synced query with id ${queryId} does not belong to connector ${connectorId}.`
    );
  }

  logger.info(
    {
      connectorId,
      queryId,
      limit,
      lastModifiedDateCursor,
      lastSeenModifiedDate,
      upToLastModifiedDate,
      soql: syncedQuery.soql,
    },
    "Salesforce synced query page SOQL"
  );

  // Execute SOQL query with pagination
  const queryRes = await runSOQL({
    credentials,
    soql: syncedQuery.soql,
    limit,
    lastModifiedDateSmallerThan: lastModifiedDateCursor ?? undefined,
    lastModifiedDateOrder: "DESC",
  });

  if (queryRes.isErr()) {
    throw queryRes.error;
  }

  let processedCount = 0;

  await concurrentExecutor(
    queryRes.value.records,
    async (record) => {
      const recordId = record.Id;
      if (!recordId) {
        logger.error(
          {
            connectorId,
            queryId,
            recordId: record.Id,
          },
          "Salesforce record missing Id"
        );
        throw new Error("All records are expected to have an Id.");
      }

      const recordModifiedDate = record.LastModifiedDate
        ? new Date(record.LastModifiedDate as string)
        : null;
      if (!recordModifiedDate) {
        logger.error(
          {
            connectorId,
            queryId,
            recordId: record.Id,
          },
          "Salesforce record missing LastModifiedDate"
        );
        throw new Error("All records are expected to have a LastModifiedDate.");
      }

      // Check if we should stop based on upToLastModifiedDate
      if (upToLastModifiedDate && recordModifiedDate <= upToLastModifiedDate) {
        return;
      }

      // Generate document content using templates
      const documentTitle = syncQueryTemplateInterpolate(
        syncedQuery.titleTemplate,
        record
      );
      const documentContent = syncQueryTemplateInterpolate(
        syncedQuery.contentTemplate,
        record
      );
      const documentTags = syncedQuery.tagsTemplate
        ? syncQueryTemplateInterpolate(syncedQuery.tagsTemplate, record)
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : [];

      // Create document content structure
      const content = await renderDocumentTitleAndContent({
        dataSourceConfig,
        title: documentTitle,
        updatedAt: recordModifiedDate,
        content: {
          prefix: null,
          content: documentContent,
          sections: [],
        },
      });

      // Create document ID using record ID
      const documentId = documentIdForSyncedQuery(connectorId, queryId, record);

      // Upsert document to data source
      await upsertDataSourceDocument({
        dataSourceConfig,
        documentId,
        documentContent: content,
        documentUrl: undefined,
        timestampMs: recordModifiedDate.getTime(),
        tags: documentTags,
        parentId: folderIdForSyncedQuery(connectorId, queryId),
        parents: [documentId, folderIdForSyncedQuery(connectorId, queryId)],
        upsertContext: {
          sync_type: upToLastModifiedDate ? "incremental" : "batch",
        },
        title: documentTitle,
        mimeType: INTERNAL_MIME_TYPES.SALESFORCE.SYNCED_QUERY_DOCUMENT,
        async: true,
      });

      if (recordModifiedDate) {
        lastSeenModifiedDate =
          lastSeenModifiedDate && lastSeenModifiedDate > recordModifiedDate
            ? lastSeenModifiedDate
            : recordModifiedDate;

        lastModifiedDateCursor =
          lastModifiedDateCursor && recordModifiedDate >= lastModifiedDateCursor
            ? lastModifiedDateCursor
            : recordModifiedDate;
      }

      processedCount++;
    },
    { concurrency: 8 }
  );

  if (lastSeenModifiedDate) {
    lastSeenModifiedDateString = lastSeenModifiedDate.toISOString();
  }
  if (lastModifiedDateCursor) {
    lastModifiedDateStringCursor = lastModifiedDateCursor.toISOString();
  }

  return {
    lastSeenModifiedDateString,
    lastModifiedDateStringCursor,
    hasMore: processedCount > 0,
    count: processedCount,
  };
}

export async function updateSyncedQueryLastSeenModifiedDate(
  connectorId: ModelId,
  {
    queryId,
    lastSeenModifiedDate,
  }: {
    queryId: ModelId;
    lastSeenModifiedDate: Date | null;
  }
) {
  const syncedQuery = await SalesforceSyncedQueryResource.fetchById(queryId);

  if (!syncedQuery) {
    throw new Error(`Synced query with id ${queryId} not found.`);
  }
  if (syncedQuery.connectorId !== connectorId) {
    throw new Error(
      `Synced query with id ${queryId} does not belong to connector ${connectorId}.`
    );
  }

  await syncedQuery.updateLastSeenModifiedAt(lastSeenModifiedDate);
}
