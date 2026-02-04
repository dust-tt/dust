import {
  fetchTree,
  isConnectionReadonly,
} from "@connectors/connectors/bigquery/lib/bigquery_api";
import { BigQueryConfigurationModel } from "@connectors/lib/models/bigquery";
import { sync } from "@connectors/lib/remote_databases/activities";
import { getConnectorAndCredentials } from "@connectors/lib/remote_databases/utils";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger, { getActivityLogger } from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import {
  INTERNAL_MIME_TYPES,
  isBigQueryWithLocationCredentials,
} from "@connectors/types";

// Must be kept in sync with the tag in core.
const USE_METADATA_FOR_DBML_TAG = "bigquery:useMetadataForDBML";

export async function syncBigQueryConnection(connectorId: ModelId) {
  const getConnectorAndCredentialsRes = await getConnectorAndCredentials({
    connectorId,
    isTypeGuard: isBigQueryWithLocationCredentials,
    logger,
  });
  if (getConnectorAndCredentialsRes.isErr()) {
    throw getConnectorAndCredentialsRes.error;
  }

  await syncStarted(connectorId);

  const { credentials, connector } = getConnectorAndCredentialsRes.value;

  const connectorConfig = await BigQueryConfigurationModel.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!connectorConfig) {
    throw new Error(
      `Connector configuration not found for connector ${connector.id}`
    );
  }

  // BigQuery is read-only as we force the readonly scope when creating the client.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- BigQuery is read-only but leaving the call in case of copy-pasting later.
  const _readonlyConnectionCheck = isConnectionReadonly();

  const useMetadataForDBML = connectorConfig.useMetadataForDBML;

  const activityLogger = getActivityLogger(connector);

  const treeRes = await fetchTree({
    credentials,
    fetchTablesDescription: useMetadataForDBML,
    logger: activityLogger,
  });
  if (treeRes.isErr()) {
    throw treeRes.error;
  }
  const tree = treeRes.value;

  await sync({
    remoteDBTree: tree,
    mimeTypes: INTERNAL_MIME_TYPES.BIGQUERY,
    connector,
    tags: useMetadataForDBML ? [USE_METADATA_FOR_DBML_TAG] : [],
  });

  await syncSucceeded(connectorId);
}
