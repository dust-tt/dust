import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import {
  extractTenantIdFromAccessToken,
  getMicrosoftConnectionData,
} from "@connectors/connectors/microsoft";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { ConnectorMetadata } from "@connectors/resources/storage/models/connector_model";

async function backfillConnectorTenant({
  connector,
  execute,
  logger,
}: {
  connector: ConnectorModel;
  execute: boolean;
  logger: Logger;
}) {
  const childLogger = logger.child({ connectorId: connector.id });

  const metadata = (connector.metadata ?? {}) as ConnectorMetadata;
  if (metadata.tenantId) {
    childLogger.info("Tenant id already present, skipping");
    return;
  }

  try {
    const { accessToken } = await getMicrosoftConnectionData(
      connector.connectionId
    );
    const tenantId = extractTenantIdFromAccessToken(accessToken);

    if (!tenantId) {
      childLogger.warn("Unable to extract tenant id from access token");
      return;
    }

    childLogger.info({ tenantId, execute }, "Backfilling tenant id");

    if (execute) {
      const newMetadata: ConnectorMetadata = {
        ...metadata,
        tenantId,
      };
      await connector.update({ metadata: newMetadata });
    }
  } catch (error) {
    childLogger.error({ error }, "Failed to backfill tenant id");
  }
}

makeScript(
  {
    connectorId: {
      type: "number",
      describe: "Process a single connector id",
      required: false,
    },
    nextConnectorId: {
      type: "number",
      describe:
        "Process connectors with id greater than the provided value (supports pagination)",
      required: false,
      default: 0,
    },
    batchSize: {
      type: "number",
      describe: "Maximum number of connectors to process per run",
      required: false,
      default: 50,
    },
  },
  async ({ connectorId, nextConnectorId, batchSize, execute }, scriptLogger) => {
    if (connectorId && connectorId > 0) {
      const connector = await ConnectorModel.findByPk(connectorId);
      if (!connector || connector.type !== "microsoft") {
        scriptLogger.warn(
          { connectorId },
          "Connector not found or not a Microsoft connector"
        );
        return;
      }
      await backfillConnectorTenant({ connector, execute, logger: scriptLogger });
      return;
    }

    const connectors = await ConnectorModel.findAll({
      where: {
        type: "microsoft",
        id:
          nextConnectorId && nextConnectorId > 0
            ? {
                [Op.gt]: nextConnectorId,
              }
            : {
                [Op.gt]: 0,
              },
      },
      order: [["id", "ASC"]],
      limit: batchSize,
    });

    if (connectors.length === 0) {
      scriptLogger.info("No Microsoft connectors matched the criteria");
      return;
    }

    for (const connector of connectors) {
      await backfillConnectorTenant({
        connector,
        execute,
        logger: scriptLogger,
      });
    }

    const lastProcessedId = connectors[connectors.length - 1]?.id;
    if (lastProcessedId) {
      scriptLogger.info(
        { nextConnectorId: lastProcessedId },
        "To continue, re-run the script with --nextConnectorId set to this value"
      );
    }
  }
);

