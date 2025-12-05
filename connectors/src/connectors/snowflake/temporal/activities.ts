import {
  connectToSnowflake,
  fetchTree,
  isConnectionReadonly,
  useWarehouse,
} from "@connectors/connectors/snowflake/lib/snowflake_api";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { sync } from "@connectors/lib/remote_databases/activities";
import { getConnectorAndCredentials } from "@connectors/lib/remote_databases/utils";
import {
  syncFailed,
  syncStarted,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES, isSnowflakeCredentials } from "@connectors/types";

export async function syncSnowflakeConnection(connectorId: ModelId) {
  const localLogger = logger.child({
    connectorId,
  });

  const getConnectorAndCredentialsRes = await getConnectorAndCredentials({
    connectorId,
    isTypeGuard: isSnowflakeCredentials,
    logger: localLogger,
  });
  if (getConnectorAndCredentialsRes.isErr()) {
    throw getConnectorAndCredentialsRes.error;
  }

  await syncStarted(connectorId);

  const { credentials, connector } = getConnectorAndCredentialsRes.value;

  const connectionRes = await connectToSnowflake(credentials);
  if (connectionRes.isErr()) {
    throw connectionRes.error;
  }
  const connection = connectionRes.value;

  // Align with core: ensure the configured warehouse is usable. If not, treat as
  // an authorization problem so the connector gets paused and flagged.
  const useWarehouseRes = await useWarehouse({ credentials, connection });
  if (useWarehouseRes.isErr()) {
    throw new ExternalOAuthTokenError(useWarehouseRes.error);
  }

  const readonlyConnectionCheck = await isConnectionReadonly({
    credentials,
    connection,
  });

  localLogger.info("Starting snowflake sync");

  if (readonlyConnectionCheck.isErr()) {
    if (readonlyConnectionCheck.error.code !== "NOT_READONLY") {
      // Any other error here is "unexpected".
      throw readonlyConnectionCheck.error;
    }
    // The connection is not read-only...

    localLogger.info("Connection is not read-only, garbage collecting");
    // We garbage collect everything that was synced as nothing will be marked as used.
    await sync({
      mimeTypes: INTERNAL_MIME_TYPES.SNOWFLAKE,
      connector,
      tags: [],
    });

    // ... and we mark the connector as errored.
    await syncFailed(connectorId, "remote_database_connection_not_readonly");
  } else {
    localLogger.info("Fetching tree from Snowflake");
    const treeRes = await fetchTree(
      { credentials, connection },
      { connectorId }
    );
    if (treeRes.isErr()) {
      throw treeRes.error;
    }
    const tree = treeRes.value;

    await sync({
      remoteDBTree: tree,
      mimeTypes: INTERNAL_MIME_TYPES.SNOWFLAKE,
      connector,
      tags: [],
    });

    await syncSucceeded(connectorId);
  }
}
