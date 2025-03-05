import type { ModelId } from "@dust-tt/types";

import {
  getGongAccessToken,
  GongClient,
} from "@connectors/connectors/gong/lib/gong_api";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { GongConfigurationResource } from "@connectors/resources/gong_resources";

async function fetchGongConnector(
  connectorId: ModelId
): Promise<ConnectorResource> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }
  return connector;
}

async function fetchGongConfiguration(
  connector: ConnectorResource
): Promise<GongConfigurationResource> {
  const configuration =
    await GongConfigurationResource.fetchByConnector(connector);
  if (!configuration) {
    throw new Error("[Gong] Configuration not found.");
  }
  return configuration;
}

async function getGongClient(connector: ConnectorResource) {
  const accessTokenResult = await getGongAccessToken(connector);
  if (accessTokenResult.isErr()) {
    throw accessTokenResult.error;
  }

  return new GongClient(accessTokenResult.value, connector.id);
}

export async function gongSaveStartSyncActivity(connectorId: ModelId) {
  const connector = await fetchGongConnector(connectorId);

  const result = await syncStarted(connector.id);
  if (result.isErr()) {
    throw result.error;
  }
}

export async function gongSaveSyncSuccessActivity(connectorId: ModelId) {
  const connector = await fetchGongConnector(connectorId);

  const result = await syncSucceeded(connector.id);
  if (result.isErr()) {
    throw result.error;
  }
}

export async function gongSyncTranscriptsActivity(connectorId: ModelId) {
  const connector = await fetchGongConnector(connectorId);
  const configuration = await fetchGongConfiguration(connector);
  const syncStartTs = Date.now();

  const gongClient = await getGongClient(connector);

  let pageCursor = null;
  do {
    const transcripts = await gongClient.getTranscripts({
      startTimestamp: configuration.timestampCursor,
      pageCursor,
    });
    // TODO(2025-03-05) - Add upserts here.
    pageCursor = transcripts.nextPageCursor;
  } while (pageCursor);

  await configuration.setCursor(syncStartTs);
}
