import {
  fetchTree,
  isAuthenticationError,
} from "@connectors/connectors/databricks/lib/databricks_api";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { sync } from "@connectors/lib/remote_databases/activities";
import { getConnectorAndCredentials } from "@connectors/lib/remote_databases/utils";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import {
  INTERNAL_MIME_TYPES,
  isDatabricksCredentials,
} from "@connectors/types";

export async function syncDatabricksConnection(connectorId: ModelId) {
  const localLogger = logger.child({
    connectorId,
  });

  const connectorAndCredentialsRes = await getConnectorAndCredentials({
    connectorId,
    isTypeGuard: isDatabricksCredentials,
    logger: localLogger,
  });

  if (connectorAndCredentialsRes.isErr()) {
    throw connectorAndCredentialsRes.error;
  }

  const { connector, credentials } = connectorAndCredentialsRes.value;

  await syncStarted(connectorId);

  const treeRes = await fetchTree({
    credentials,
    logger: localLogger,
  });

  if (treeRes.isErr()) {
    if (isAuthenticationError(treeRes.error)) {
      throw new ExternalOAuthTokenError(treeRes.error);
    }
    throw treeRes.error;
  }

  await sync({
    remoteDBTree: treeRes.value,
    mimeTypes: INTERNAL_MIME_TYPES.DATABRICKS,
    connector,
    tags: [],
  });

  await syncSucceeded(connectorId);
}
