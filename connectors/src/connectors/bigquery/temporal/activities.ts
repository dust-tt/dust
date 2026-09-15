import {
  fetchTree,
  isConnectionReadonly,
} from "@connectors/connectors/bigquery/lib/bigquery_api";
import { BigQueryConfigurationModel } from "@connectors/lib/models/bigquery";
import {
  hasSelectedRemoteDatabasePermissions,
  sync,
} from "@connectors/lib/remote_databases/activities";
import type { RemoteDBTree } from "@connectors/lib/remote_databases/utils";
import { getConnectorAndCredentials } from "@connectors/lib/remote_databases/utils";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger, { getActivityLogger } from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import {
  INTERNAL_MIME_TYPES,
  isBigQueryWithLocationCredentials,
} from "@connectors/types";

// Must be kept in sync with the tags in core.
const USE_METADATA_FOR_DBML_TAG = "bigquery:useMetadataForDBML";
const MAXIMUM_BYTES_BILLED_TAG_PREFIX = "bigquery:maximumBytesBilled:";

function buildBigQuerySyncTags({
  useMetadataForDBML,
  maximumBytesBilled,
}: {
  useMetadataForDBML: boolean;
  maximumBytesBilled: number | string | null;
}): string[] {
  const tags: string[] = [];
  if (useMetadataForDBML) {
    tags.push(USE_METADATA_FOR_DBML_TAG);
  }
  if (maximumBytesBilled !== null && maximumBytesBilled !== undefined) {
    const bytes =
      typeof maximumBytesBilled === "string"
        ? Number(maximumBytesBilled)
        : maximumBytesBilled;
    if (Number.isFinite(bytes) && bytes > 0) {
      tags.push(`${MAXIMUM_BYTES_BILLED_TAG_PREFIX}${bytes}`);
    }
  }
  return tags;
}

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

  // Enumerating a BigQuery project's datasets and tables can take hours on large warehouses
  // (observed 14h on a 100k+ table project). When nothing is selected there is nothing to sync, so
  // skip the enumeration entirely and let `sync` run its cleanup with an empty tree. See the
  // `remote-databases-skip-enumeration-when-nothing-selected` contract in remote_databases.
  const hasSelection = await hasSelectedRemoteDatabasePermissions(connector.id);

  let tree: RemoteDBTree | undefined;
  if (hasSelection) {
    const treeRes = await fetchTree({
      credentials,
      fetchTablesDescription: useMetadataForDBML,
      logger: activityLogger,
    });
    if (treeRes.isErr()) {
      throw treeRes.error;
    }
    tree = treeRes.value;
  } else {
    activityLogger.info(
      { connectorId },
      "[BigQuery] No selected permissions, skipping remote tree enumeration."
    );
  }

  await sync({
    remoteDBTree: tree,
    mimeTypes: INTERNAL_MIME_TYPES.BIGQUERY,
    connector,
    // On the skip path a selection may have been saved between the precheck and `sync`'s read;
    // preserve it instead of deleting it so the resync it signaled can recover it. Required by the
    // `remote-databases-skip-enumeration-when-nothing-selected` contract.
    preserveSelectedPermissions: !hasSelection,
    tags: buildBigQuerySyncTags({
      useMetadataForDBML,
      maximumBytesBilled: connectorConfig.maximumBytesBilled,
    }),
  });

  await syncSucceeded(connectorId);
}
