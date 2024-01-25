import type { ModelId } from "@dust-tt/types";

import { fetchIntercomHelpCenter } from "@connectors/connectors/intercom/lib/intercom_api";
import {
  removeHelpCenter,
  syncCollection,
} from "@connectors/connectors/intercom/temporal/sync_help_center";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import {
  IntercomCollection,
  IntercomHelpCenter,
} from "@connectors/lib/models/intercom";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";

async function _getIntercomConnectorOrRaise(connectorId: ModelId) {
  const connector = await Connector.findOne({
    where: {
      type: "intercom",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("[Intercom] Connector not found.");
  }
  return connector;
}

/**
 * This activity is responsible for updating the
 * sync status of the connector to "success".
 */
export async function saveIntercomConnectorSuccessSync({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

/**
 * This activity is responsible for updating the
 * lastSyncStartTime of the connector to now.
 */
export async function saveIntercomConnectorStartSync({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

/**
 * This activity is responsible for retrieving the list
 * of help center ids to sync for a given connector.
 *
 * We sync all the help centers that are in DB.
 */
export async function getHelpCenterIdsToSyncActivity(connectorId: ModelId) {
  const helpCenters = await IntercomHelpCenter.findAll({
    attributes: ["helpCenterId"],
    where: {
      connectorId: connectorId,
    },
  });
  return helpCenters.map((i) => i.helpCenterId);
}

/**
 * This activity is responsible for syncing a Help Center
 * It does NOT sync the content inside the Help Center, only the Help Center itself.
 *
 * It's going to udpate the name of the Help Center if it changed.
 * If the Help Center is not allowed anymore, it will delete all its data.
 * If the Help Center is not present on Intercom anymore, it will delete all its data.
 */
export async function syncHelpCenterOnlyActivity({
  connectorId,
  helpCenterId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  helpCenterId: string;
  currentSyncMs: number;
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceName: dataSourceConfig.dataSourceName,
  };

  const helpCenterOnDb = await IntercomHelpCenter.findOne({
    where: {
      connectorId,
      helpCenterId,
    },
  });
  if (!helpCenterOnDb) {
    throw new Error(
      `[Intercom] Help Center not found. ConnectorId: ${connectorId}, HelpCenterId: ${helpCenterId}`
    );
  }

  // If our rights were revoked or the help center is not on intercom anymore we delete it
  let shouldRemoveHelpCenter = helpCenterOnDb.permission === "none";
  if (!shouldRemoveHelpCenter) {
    const helpCenterOnIntercom = await fetchIntercomHelpCenter(
      connector.connectionId,
      helpCenterOnDb.helpCenterId
    );
    if (!helpCenterOnIntercom) {
      shouldRemoveHelpCenter = true;
    } else {
      await helpCenterOnDb.update({
        name: helpCenterOnIntercom.display_name,
        lastUpsertedTs: new Date(currentSyncMs),
      });
    }
  }

  if (shouldRemoveHelpCenter) {
    await removeHelpCenter({
      connectorId,
      dataSourceConfig,
      helpCenter: helpCenterOnDb,
      loggerArgs,
    });
  }
}

/**
 * This activity is responsible for retrieving the list of
 * Collections ids to sync for a given Help Center.
 * They are the level 1 Collections, i.e. the ones that have no parent.
 */
export async function getCollectionsIdsToSyncActivity({
  connectorId,
  helpCenterId,
}: {
  connectorId: ModelId;
  helpCenterId: string;
}) {
  const level1Collections = await IntercomCollection.findAll({
    where: {
      connectorId,
      helpCenterId: helpCenterId,
      parentId: null,
    },
  });
  return level1Collections.map((i) => i.collectionId);
}

/**
 * This activity is responsible for syncing a Collection of a given Help Center.
 * It will either upsert the Collection or delete it if it's not allowed anymore
 * or not present on Intercom.
 */
export async function syncCollectionActivity({
  connectorId,
  helpCenterId,
  collectionId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  helpCenterId: string;
  collectionId: string;
  currentSyncMs: number;
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceName: dataSourceConfig.dataSourceName,
  };

  const collection = await IntercomCollection.findOne({
    where: {
      connectorId,
      helpCenterId,
      collectionId,
    },
  });
  if (!collection) {
    logger.error(
      { loggerArgs, collectionId },
      "[Intercom] Collection to sync not found"
    );
    return;
  }
  await syncCollection({
    connectorId,
    connectionId: connector.connectionId,
    dataSourceConfig,
    loggerArgs,
    collection,
    currentSyncMs,
  });
}
