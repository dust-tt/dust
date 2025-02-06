import type { ModelId } from "@dust-tt/types";
import { isBigQueryWithLocationCredentials, MIME_TYPES } from "@dust-tt/types";

import {
  fetchTree,
  isConnectionReadonly,
} from "@connectors/connectors/bigquery/lib/bigquery_api";
import { sync } from "@connectors/lib/remote_databases/activities";
import { getConnectorAndCredentials } from "@connectors/lib/remote_databases/utils";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";

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

  // BigQuery is read-only as we force the readonly scope when creating the client.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- BigQuery is read-only but leaving the call in case of copy-pasting later.
  const readonlyConnectionCheck = isConnectionReadonly();

  const treeRes = await fetchTree({ credentials });
  if (treeRes.isErr()) {
    throw treeRes.error;
  }
  const tree = treeRes.value;

  await sync({ remoteDBTree: tree, mimeTypes: MIME_TYPES.BIGQUERY, connector });

  await syncSucceeded(connectorId);
}
