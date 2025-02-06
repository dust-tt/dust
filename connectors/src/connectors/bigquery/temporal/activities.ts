import type { ModelId } from "@dust-tt/types";
import { isBigQueryWithLocationCredentials, MIME_TYPES } from "@dust-tt/types";

import {
  connectToBigQuery,
  fetchDatasets,
  fetchTables,
  isConnectionReadonly,
} from "@connectors/connectors/bigquery/lib/bigquery_api";
import { sync } from "@connectors/lib/remote_databases/activities";
import type { RemoteDBTable } from "@connectors/lib/remote_databases/utils";
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

  const connection = connectToBigQuery(credentials);

  // BigQuery is read-only as we force the readonly scope when creating the client.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- BigQuery is read-only but leaving the call in case of copy-pasting later.
  const readonlyConnectionCheck = isConnectionReadonly();

  const datasetRes = await fetchDatasets({ credentials, connection });
  if (datasetRes.isErr()) {
    throw datasetRes.error;
  }
  const datasets = datasetRes.value;

  const liveTables: RemoteDBTable[] = [];
  for (const dataset of datasets) {
    const tablesOnBigQueryRes = await fetchTables({
      credentials,
      datasetName: dataset.name,
      connection,
    });
    if (tablesOnBigQueryRes.isErr()) {
      throw tablesOnBigQueryRes.error;
    }

    liveTables.push(...tablesOnBigQueryRes.value);
  }

  await sync({ liveTables, mimeTypes: MIME_TYPES.BIGQUERY, connector });

  await syncSucceeded(connectorId);
}
