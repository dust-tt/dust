import type { ModelId } from "@dust-tt/types";
import { isSnowflakeCredentials, MIME_TYPES } from "@dust-tt/types";

import {
  connectToSnowflake,
  fetchTree,
  isConnectionReadonly,
} from "@connectors/connectors/snowflake/lib/snowflake_api";
import { sync } from "@connectors/lib/remote_databases/activities";
import { getConnectorAndCredentials } from "@connectors/lib/remote_databases/utils";
import {
  syncFailed,
  syncStarted,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";

export async function syncSnowflakeConnection(connectorId: ModelId) {
  const getConnectorAndCredentialsRes = await getConnectorAndCredentials({
    connectorId,
    isTypeGuard: isSnowflakeCredentials,
    logger,
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

  const readonlyConnectionCheck = await isConnectionReadonly({
    credentials,
    connection,
  });

  logger.info({ connectorId }, "Starting snowflake sync");

  if (readonlyConnectionCheck.isErr()) {
    if (readonlyConnectionCheck.error.code !== "NOT_READONLY") {
      // Any other error here is "unexpected".
      throw readonlyConnectionCheck.error;
    }
    // The connection is not read-only...

    logger.info(
      { connectorId },
      "Connection is not read-only, garbage collecting"
    );
    // We garbage collect everything that was synced as nothing will be marked as used.
    await sync({
      mimeTypes: MIME_TYPES.SNOWFLAKE,
      connector,
    });

    // ... and we mark the connector as errored.
    await syncFailed(connectorId, "remote_database_connection_not_readonly");
  } else {
    const treeRes = await fetchTree({ credentials, connection });
    if (treeRes.isErr()) {
      throw treeRes.error;
    }
    const tree = treeRes.value;

    await sync({
      remoteDBTree: tree,
      mimeTypes: MIME_TYPES.SNOWFLAKE,
      connector,
    });

    await syncSucceeded(connectorId);
  }
}
