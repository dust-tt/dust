import { makeScript } from "scripts/helpers";

import { getMicrosoftClient } from "@connectors/connectors/microsoft";
import { isMicrosoftSignInError } from "@connectors/connectors/microsoft/temporal/cast_known_errors";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    connectorId: { type: "number" },
  },
  async ({ execute, connectorId }, logger) => {
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error("Connector not found.");
    }

    if (execute) {
      try {
        await getMicrosoftClient(connector.connectionId);
      } catch (error) {
        logger.info({
          error,
          msg: error instanceof Error ? error.message : "error is not an Error",
          wasErrorIdentified: isMicrosoftSignInError(error),
        });
      }
    }
  }
);
