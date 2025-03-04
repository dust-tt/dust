import type { ModelId } from "@dust-tt/types";

import {
  getGongAccessToken,
  GongClient,
} from "@connectors/connectors/gong/lib/gong_api";
import { GongTimestampCursorModel } from "@connectors/lib/models/gong";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

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
  // TODO(2025-03-04) add a Resource.
  const cursor = await GongTimestampCursorModel.findOne({
    where: { connectorId },
  });

  return { cursor: cursor?.timestampCursor ?? null };
}

export async function gongSaveTimestampCursorActivity(
  connectorId: ModelId,
  currentSyncDateMs: number
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }

  // Initializing the timestamp cursor if it does not exist (initial sync), updating it otherwise.
  const cursor = await GongTimestampCursorModel.findOne({
    where: { connectorId },
  });
  if (!cursor) {
    await GongTimestampCursorModel.create({
      connectorId,
      timestampCursor: new Date(currentSyncDateMs),
    });
  } else {
    await cursor.update({
      timestampCursor: new Date(currentSyncDateMs),
    });
  }
}

export async function getGongTranscriptsActivity(
  connectorId: ModelId,
  args: Parameters<GongClient["getTranscripts"]>[0]
) {
  const gongClient = await getGongClient(connectorId);
  return gongClient.getTranscripts(args);
}
