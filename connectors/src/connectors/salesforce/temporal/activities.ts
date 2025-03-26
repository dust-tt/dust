import { fetchTree } from "@connectors/connectors/salesforce/lib/salesforce_api";
import { getConnectorAndCredentials } from "@connectors/connectors/salesforce/lib/utils";
import { sync } from "@connectors/lib/remote_databases/activities";
import { parseInternalId } from "@connectors/lib/remote_databases/utils";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

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
    mimeTypes: INTERNAL_MIME_TYPES.SALESFORCE,
    connector,
    // Only keep the table name in the remote table id.
    internalTableIdToRemoteTableId: (internalTableId: string) =>
      parseInternalId(internalTableId).tableName ?? internalTableId,
  });

  await syncSucceeded(connectorId);
}
