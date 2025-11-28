import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { getMicrosoftConnectionData } from "@connectors/connectors/microsoft";
import type { Logger } from "@connectors/logger/logger";
import { MicrosoftConfigurationResource } from "@connectors/resources/microsoft_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

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

  const config = await MicrosoftConfigurationResource.fetchByConnectorId(
    connector.id
  );

  if (!config) {
    childLogger.warn("No Microsoft configuration found, skipping");
    return;
  }

  if (config.tenantId) {
    childLogger.info("Tenant id already present, skipping");
    return;
  }

  const { tenantId } = await getMicrosoftConnectionData(connector.connectionId);

  if (!tenantId) {
    childLogger.warn("Unable to extract tenant id from access token");
    return;
  }

  childLogger.info({ tenantId, execute }, "Backfilling tenant id");

  if (execute) {
    await config.model.update(
      { tenantId },
      {
        where: {
          id: config.id,
        },
        hooks: false,
        silent: true,
      }
    );

    await config.update({ tenantId });
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
  async (
    { connectorId, nextConnectorId, batchSize, execute },
    scriptLogger
  ) => {
    if (connectorId && connectorId > 0) {
      const connector = await ConnectorModel.findByPk(connectorId);
      if (!connector || connector.type !== "microsoft") {
        scriptLogger.warn(
          { connectorId },
          "Connector not found or not a Microsoft connector"
        );
        return;
      }
      await backfillConnectorTenant({
        connector,
        execute,
        logger: scriptLogger,
      });
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
      try {
        await backfillConnectorTenant({
          connector,
          execute,
          logger: scriptLogger,
        });
      } catch (error) {
        scriptLogger.error(
          { connectorId: connector.id, error },
          "Error backfilling tenant id"
        );
      }
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
