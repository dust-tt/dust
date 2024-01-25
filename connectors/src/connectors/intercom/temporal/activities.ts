import type { ModelId } from "@dust-tt/types";

import { getIntercomClient } from "@connectors/connectors/intercom/lib/intercom_api";
import { syncHelpCenter } from "@connectors/connectors/intercom/temporal/sync_help_center";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import { IntercomHelpCenter } from "@connectors/lib/models/intercom";
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
 * Updates the sync status of the connector to "success".
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
 * Updates the lastSyncStartTime of the connector to now.
 *
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
 * Syncs an Intercom Help Center for a given connector.
 */
export async function syncHelpCenterActivity({
  connectorId,
  helpCenterId,
}: {
  connectorId: ModelId;
  helpCenterId: string;
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceName: dataSourceConfig.dataSourceName,
  };

  const intercomClient = await getIntercomClient(connector.connectionId);
  const helpCenter = await IntercomHelpCenter.findOne({
    where: {
      connectorId,
      helpCenterId,
    },
  });

  if (!helpCenter) {
    throw new Error(
      `[Intercom] Help Center not found. ConnectorId: ${connectorId}, HelpCenterId: ${helpCenterId}`
    );
  }
  // Intercom temp Daph
  logger.info("syncHelpCenterActivity", { loggerArgs, helpCenterId });
  await syncHelpCenter({
    connector,
    intercomClient,
    dataSourceConfig,
    helpCenter,
    loggerArgs,
  });
}

export async function getHelpCenterIdsToSyncActivity(connectorId: ModelId) {
  const helpCenters = await IntercomHelpCenter.findAll({
    attributes: ["helpCenterId"],
    where: {
      connectorId: connectorId,
    },
  });

  return helpCenters.map((i) => i.helpCenterId);
}
