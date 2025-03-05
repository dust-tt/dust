import type { ModelId } from "@dust-tt/types";

import {
  getGongAccessToken,
  GongClient,
} from "@connectors/connectors/gong/lib/gong_api";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { GongConfigurationResource } from "@connectors/resources/gong_resources";

const logger = mainLogger.child({
  provider: "gong",
});

async function getGongClient(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }
  const accessTokenResult = await getGongAccessToken(connector);
  if (accessTokenResult.isErr()) {
    throw accessTokenResult.error;
  }

  return new GongClient(accessTokenResult.value);
}

export async function gongSaveStartSyncActivity(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }

  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function gongSaveSyncSuccessActivity(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }

  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function gongLoadTimestampCursorActivity(
  connectorId: ModelId
): Promise<{ cursor: Date | null }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }
  const configuration =
    await GongConfigurationResource.fetchByConnector(connector);

  return { cursor: configuration?.timestampCursor ?? null };
}

export async function gongSaveTimestampCursorActivity(
  connectorId: ModelId,
  currentSyncDateMs: number
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }

  const configuration =
    await GongConfigurationResource.fetchByConnector(connector);
  if (!configuration) {
    throw new Error("[Gong] Configuration not found.");
  }
  await configuration.update({ timestampCursor: currentSyncDateMs });
}

export async function getGongTranscriptsActivity(
  connectorId: ModelId,
  args: Parameters<GongClient["getTranscripts"]>[0]
) {
  const gongClient = await getGongClient(connectorId);
  return gongClient.getTranscripts(args);
}
