import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import {
  ConnectorsAPI,
  Err,
  getOAuthConnectionAccessToken,
  Ok,
} from "@app/types";

export const getAccessTokenPlugin = createPlugin({
  manifest: {
    id: "get-access-token",
    name: "Get Access Token",
    description: "Retrieve the OAuth access token for this data source.",
    resourceTypes: ["data_sources"],
    args: {},
    redactResult: true,
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    // Only applicable to data sources with connectors
    return !!resource.connectorId;
  },
  execute: async (auth, dataSource) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    if (!dataSource.connectorId) {
      return new Err(new Error("Data source does not have a connector."));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const connectorRes = await connectorsAPI.getConnector(
      dataSource.connectorId
    );

    if (connectorRes.isErr()) {
      return new Err(
        new Error(`Failed to fetch connector: ${connectorRes.error.message}`)
      );
    }

    const connector = connectorRes.value;

    const tokenRes = await getOAuthConnectionAccessToken({
      config: config.getOAuthAPIConfig(),
      logger,
      connectionId: connector.connectionId,
    });

    if (tokenRes.isErr()) {
      return new Err(
        new Error(`Failed to fetch access token: ${tokenRes.error.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: tokenRes.value.access_token,
    });
  },
});
