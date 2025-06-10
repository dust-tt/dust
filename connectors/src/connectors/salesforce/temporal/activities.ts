import { fetchTree } from "@connectors/connectors/salesforce/lib/salesforce_api";
import { getConnectorAndCredentials } from "@connectors/connectors/salesforce/lib/utils";
import { sync } from "@connectors/lib/remote_databases/activities";
import { parseInternalId } from "@connectors/lib/remote_databases/utils";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { SalesforceSyncedQueryResource } from "@connectors/resources/salesforce_resources";
import type { ModelId } from "@connectors/types";
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

// Dicsover all Salesforce synced queries for a given connector.
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

// Syncs one page of results from a Salesforce query as defined by pagination arguments offset and
// limit. Stops as soon as a record.lastModifiedDate is smaller than upToLastModifiedDate (if
// defined) or there is no record remaining to sync. Returns the lastModifiedDate seen so far.
export async function syncSalesforceQueryPage(
  connectorId: ModelId,
  {
    queryId,
    offset,
    limit,
    lastSeenModifiedDate,
    upToLastModifiedDate,
  }: {
    queryId: ModelId;
    offset: number;
    limit: number;
    lastSeenModifiedDate: Date | null;
    upToLastModifiedDate: Date | null;
  }
): Promise<{
  lastSeenModifiedDate: Date | null;
  hasMore: boolean;
  count: number;
}> {
  const connAndCredsRes = await getConnectorAndCredentials(connectorId);
  if (connAndCredsRes.isErr()) {
    throw connAndCredsRes.error;
  }

  // Do SOQL query
  // Extract docs
  // Upsert them to data source

  return {
    lastSeenModifiedDate,
    hasMore: false,
    count: 0,
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
