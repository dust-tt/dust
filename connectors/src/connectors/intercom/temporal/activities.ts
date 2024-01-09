import { ModelId } from "@dust-tt/types";

import {
  fetchIntercomHelpCenter,
  getIntercomClient,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  removeHelpCenterFromDbAndCore,
  syncHelpCenterInDbAndCore,
} from "@connectors/connectors/intercom/temporal/sync_help_center";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import { IntercomHelpCenter } from "@connectors/lib/models/intercom";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { DataSourceConfig } from "@connectors/types/data_source_config";

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
 * Syncs all Intercom Help Centers Collections & articles for a given connector.
 */
export async function syncHelpCentersActivity({
  connectorId,
  dataSourceConfig,
  loggerArgs,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  loggerArgs: Record<string, string | number>;
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const connectionId = connector.connectionId;
  const intercomClient = await getIntercomClient(connector.connectionId);

  const helpCentersOnDb = await IntercomHelpCenter.findAll({
    where: {
      connectorId,
    },
  });

  await sequelize_conn.transaction(async (transaction) => {
    helpCentersOnDb.map(async (helpCenter) => {
      const helpCenterId = helpCenter.helpCenterId;
      const matchingHelpCenterOnIntercom = await fetchIntercomHelpCenter(
        connectionId,
        helpCenterId
      );

      // If the help center is not on intercom anymore we delete it
      if (!matchingHelpCenterOnIntercom) {
        await removeHelpCenterFromDbAndCore({
          dataSourceConfig,
          helpCenter,
          transaction,
        });
      } else {
        await helpCenter.update({
          name: matchingHelpCenterOnIntercom.display_name,
        });
        await syncHelpCenterInDbAndCore({
          connectorId,
          intercomClient,
          dataSourceConfig,
          helpCenter,
          loggerArgs,
          transaction,
        });
      }
    });
  });
}
