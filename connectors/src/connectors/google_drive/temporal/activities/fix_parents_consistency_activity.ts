import { Op } from "sequelize";

import { fixParentsConsistency } from "@connectors/connectors/google_drive/lib";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export async function fixParentsConsistencyActivity({
  connectorId,
  fromId,
  execute,
  startTs,
}: {
  connectorId: ModelId;
  fromId: number;
  execute: boolean;
  startTs: number;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const localLogger = getActivityLogger(connector);

  const limit = 1000;
  const files = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connector.id,
      id: { [Op.gt]: fromId },
    },
    order: [["id", "ASC"]],
    limit,
  });

  const connectorResource = await ConnectorResource.fetchById(connector.id);
  if (!connectorResource) {
    throw new Error("Connector not found");
  }
  await fixParentsConsistency({
    connector: connectorResource,
    files,
    checkFromGoogle: true,
    execute,
    startSyncTs: startTs,
    logger: localLogger,
  });
  fromId = files[limit - 1]?.id ?? 0;

  return fromId;
}
