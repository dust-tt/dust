import { isConnectorProvider } from "@dust-tt/client";
import { makeScript } from "scripts/helpers";

import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    provider: { type: "string", required: true },
    value: { type: "boolean", required: true },
  },
  async ({ execute, provider, value }, logger) => {
    if (!isConnectorProvider(provider) || provider === "salesforce") {
      logger.error(`Invalid provider: ${provider}`);
      return;
    }

    const connectors = await ConnectorResource.listByType(provider, {});

    if (execute) {
      for (const connector of connectors) {
        await connector.setUseProxy(value);
      }
      logger.info(
        `Set useProxy to ${value} for ${connectors.length} ${provider} connectors`
      );
    } else {
      logger.info(
        `Would set useProxy to ${value} for ${connectors.length} ${provider} connectors`
      );
    }
  }
);
