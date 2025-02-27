import type { ModelId } from "@dust-tt/types";
import { MIME_TYPES } from "@dust-tt/types";

import { fetchTree } from "@connectors/connectors/salesforce/lib/salesforce_api";
import { getConnectorAndCredentials } from "@connectors/connectors/salesforce/lib/utils";
import { sync } from "@connectors/lib/remote_databases/activities";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";

export async function syncSalesforceConnection(connectorId: ModelId) {
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
    // Only keep the table name in the remote table id.
    internalTableIdToRemoteTableId: (internalTableId: string) =>
      internalTableId.split(".").pop() ?? internalTableId,
  });

  await syncSucceeded(connectorId);
}
