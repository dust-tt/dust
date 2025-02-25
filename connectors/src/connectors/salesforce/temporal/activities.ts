import type { ModelId } from "@dust-tt/types";
import { concurrentExecutor, MIME_TYPES } from "@dust-tt/types";
import type { SavedRecord } from "jsforce";

import {
  fetchTree,
  findTablesWithTextAreaFields,
  getSalesforceObjectRecords,
} from "@connectors/connectors/salesforce/lib/salesforce_api";
import { getConnectorAndCredentials } from "@connectors/connectors/salesforce/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteDataSourceDocument,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import {
  RemoteTableModel,
  RemoteTableRecordModel,
} from "@connectors/lib/models/remote_databases";
import { sync } from "@connectors/lib/remote_databases/activities";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

/**
 * This activity syncs the Salesforce connection.
 *
 * It fetches the tree of the Salesforce organization and syncs it to the remote database.
 */
export async function syncSalesforceConnectionActivity(connectorId: ModelId) {
  const getConnectorAndCredentialsRes =
    await getConnectorAndCredentials(connectorId);
  if (getConnectorAndCredentialsRes.isErr()) {
    throw getConnectorAndCredentialsRes.error;
  }

  await syncStarted(connectorId);

  const { credentials, connector } = getConnectorAndCredentialsRes.value;

  const treeRes = await fetchTree({ credentials });
  if (treeRes.isErr()) {
    throw treeRes.error;
  }
  const tree = treeRes.value;

  await sync({
    remoteDBTree: tree,
    mimeTypes: MIME_TYPES.SALESFORCE,
    connector,
  });
}

/**
 * This activity gets all tables that have some rich text fields.
 *
 * We want to sync rich text data for Salesforce as documents and not as tables,
 * because we want to be able to use semantic search on them.
 *
 * It does NOT check that we still have permissions for the tables,
 * since this function is called after the sync has been completed.
 */
export async function getTablesWithRichTextFieldsActivity(
  connectorId: ModelId
) {
  const getConnectorAndCredentialsRes =
    await getConnectorAndCredentials(connectorId);
  if (getConnectorAndCredentialsRes.isErr()) {
    throw getConnectorAndCredentialsRes.error;
  }
  const { credentials, connector } = getConnectorAndCredentialsRes.value;

  const allTables = await RemoteTableModel.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  const tablesWithRichTextFieldsRes = await findTablesWithTextAreaFields(
    credentials,
    allTables.map((table) => ({
      name: table.name,
      internalId: table.internalId,
    }))
  );
  if (tablesWithRichTextFieldsRes.isErr()) {
    throw tablesWithRichTextFieldsRes.error;
  }

  return tablesWithRichTextFieldsRes.value;
}

/**
 * This activity syncs the rich text data for a given table.
 *
 * It loops on all records and checks if we have it on db.
 * If we do and it has been updated since, we update it.
 *
 * Then it upserts the datasource document.
 */
export async function syncTableRichTextDataActivity({
  connectorId,
  tableInternalId,
  textAreaFields,
  currentSyncMs,
}: {
  connectorId: ModelId;
  tableInternalId: string;
  textAreaFields: string[];
  currentSyncMs: number;
}) {
  const getConnectorAndCredentialsRes =
    await getConnectorAndCredentials(connectorId);
  if (getConnectorAndCredentialsRes.isErr()) {
    throw getConnectorAndCredentialsRes.error;
  }

  const { credentials, connector } = getConnectorAndCredentialsRes.value;
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const table = await RemoteTableModel.findOne({
    where: {
      connectorId: connector.id,
      internalId: tableInternalId,
    },
  });
  if (!table) {
    throw new Error(`Table ${tableInternalId} not found`);
  }

  let nextCursor = null;
  let allDone = false;

  while (!allDone) {
    const recordsRes = await getSalesforceObjectRecords({
      credentials,
      objectName: table.name,
      nextRecordsUrl: nextCursor,
      batchSize: 200,
    });
    if (recordsRes.isErr()) {
      throw recordsRes.error;
    }

    const { records, done, nextRecordsUrl } = recordsRes.value;
    await processRecords({
      connectorId: connector.id,
      dataSourceConfig,
      table,
      textAreaFields,
      records,
      currentSyncMs,
    });
    if (done) {
      allDone = true;
    }
    nextCursor = nextRecordsUrl;
  }

  logger.info(
    { connectorId: connector.id },
    "Sync of rich text data completed."
  );

  await syncSucceeded(connectorId);
}

/**
 * This function processes the records and upserts them to the database,
 * and creates the datasource document.
 */
async function processRecords({
  connectorId,
  dataSourceConfig,
  table,
  textAreaFields,
  records,
  currentSyncMs,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  table: RemoteTableModel;
  textAreaFields: string[];
  records: SavedRecord[];
  currentSyncMs: number;
}) {
  await concurrentExecutor(
    records,
    async (record) => {
      await processRecord({
        connectorId,
        dataSourceConfig,
        table,
        textAreaFields,
        record,
        currentSyncMs,
      });
    },
    { concurrency: 8 }
  );
}

/**
 * This function processes a single record.
 *
 * It checks if the record has been updated since the last sync,
 * and if it has, it upserts the record to the database.
 */
async function processRecord({
  connectorId,
  dataSourceConfig,
  table,
  textAreaFields,
  record,
  currentSyncMs,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  table: RemoteTableModel;
  textAreaFields: string[];
  record: SavedRecord;
  currentSyncMs: number;
}) {
  const lastUpdatedAt = new Date(record.LastModifiedDate);
  const shouldRecordContentBeUpserted = textAreaFields.some((field) => {
    return record[field] && record[field].length > 255;
  });

  let existingRecord = await RemoteTableRecordModel.findOne({
    where: {
      connectorId: connectorId,
      recordId: record.Id,
      tableInternalId: table.internalId,
    },
  });

  if (!shouldRecordContentBeUpserted) {
    // If the record has no text area fields, we can just delete the record
    // from the database and the datasource document.
    if (existingRecord) {
      await deleteDataSourceDocument(
        dataSourceConfig,
        existingRecord.internalId
      );
      await RemoteTableRecordModel.destroy({
        where: {
          id: existingRecord.id,
        },
      });
    }
    return;
  }

  if (!existingRecord) {
    existingRecord = await RemoteTableRecordModel.create({
      connectorId: connectorId,
      recordId: record.Id,
      tableInternalId: table.internalId,
      internalId: `${table.internalId}.${record.Id}`,
    });
  }

  // If the record has been updated since the last sync, we upsert the record.
  if (
    !existingRecord.lastUpsertedAt ||
    existingRecord.lastUpsertedAt < lastUpdatedAt
  ) {
    await upsertRecord({
      dataSourceConfig,
      table,
      textAreaFields,
      record,
      currentSyncMs,
    });
    await existingRecord.update({
      lastUpsertedAt: new Date(currentSyncMs),
    });
  }
}

/**
 * This function upserts the record to the database,
 * and creates the datasource document.
 */
async function upsertRecord({
  dataSourceConfig,
  table,
  textAreaFields,
  record,
}: {
  dataSourceConfig: DataSourceConfig;
  table: RemoteTableModel;
  textAreaFields: string[];
  record: SavedRecord;
  currentSyncMs: number;
}) {
  const internalId = `${table.internalId}.${record.Id}`;
  const parents = [
    table.internalId,
    `${table.databaseName}.${table.schemaName}`,
    table.databaseName,
  ];

  const content = await renderDocumentContent({
    dataSourceConfig,
    table,
    textAreaFields,
    recordId: record.Id,
    record,
  });

  await upsertDataSourceDocument({
    dataSourceConfig,
    documentId: internalId,
    documentContent: content,
    parents: parents,
    parentId: table.internalId,
    upsertContext: {
      sync_type: "batch",
    },
    mimeType: MIME_TYPES.SALESFORCE.RECORD,
    documentUrl: record.url,
    title: `${table.name} - ${record.Id}`,
    tags: [
      `title:${record.Name}`,
      `createdAt:${record.CreatedDate}`,
      `updatedAt:${record.LastModifiedDate}`,
      `recordId:${record.Id}`,
    ],
    async: true,
  });
}

const renderDocumentContent = async ({
  dataSourceConfig,
  table,
  textAreaFields,
  recordId,
  record,
}: {
  dataSourceConfig: DataSourceConfig;
  table: RemoteTableModel;
  textAreaFields: string[];
  recordId: string;
  record: SavedRecord;
}) => {
  let content = "";

  if (record.Id) {
    content += `ID: ${record.Id}\n`;
  }

  if (record.AccountId) {
    content += `Account ID: ${record.AccountId}\n`;
  }

  for (const textAreaField of textAreaFields) {
    const fieldValue = record[textAreaField];
    if (fieldValue) {
      content += `${textAreaField}: ${fieldValue}\n`;
    }
  }

  return renderDocumentTitleAndContent({
    dataSourceConfig,
    title: `Salesforce Record: ${table.name} - ${recordId}`,
    createdAt: new Date(record.CreatedDate),
    updatedAt: new Date(record.LastModifiedDate),
    content: await renderMarkdownSection(dataSourceConfig, content, {
      flavor: "gfm",
    }),
  });
};
