import type { ModelId } from "@dust-tt/types";
import { isSnowflakeCredentials, MIME_TYPES } from "@dust-tt/types";

import {
  connectToSnowflake,
  fetchTables,
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

  if (readonlyConnectionCheck.isErr()) {
    if (readonlyConnectionCheck.error.code !== "NOT_READONLY") {
      // Any other error here is "unexpected".
      throw readonlyConnectionCheck.error;
    }
    // The connection is not read-only...

    // We garbage collect everything that was synced as nothing will be marked as used.
    await sync({
      liveTables: [],
      mimeTypes: MIME_TYPES.SNOWFLAKE,
      connector,
    });

    // ... and we mark the connector as errored.
    await syncFailed(connectorId, "remote_database_connection_not_readonly");
  } else {
    const tablesOnSnowflakeRes = await fetchTables({ credentials, connection });
    if (tablesOnSnowflakeRes.isErr()) {
      throw tablesOnSnowflakeRes.error;
    }
    const tablesOnSnowflake = tablesOnSnowflakeRes.value;

    await sync({
      liveTables: tablesOnSnowflake,
      mimeTypes: MIME_TYPES.SNOWFLAKE,
      connector,
    });

    await syncSucceeded(connectorId);
  }
}
