import type { WhitelistableFeature } from "@dust-tt/types";
import { cacheWithRedis, DustAPI } from "@dust-tt/types";

import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

async function getEnabledFeatureFlags(
  connector: ConnectorResource
): Promise<WhitelistableFeature[]> {
  const ds = dataSourceConfigFromConnector(connector);

  // List the feature flags enabled for the workspace.
  const dustAPI = new DustAPI(
    apiConfig.getDustAPIConfig(),
    {
      apiKey: ds.workspaceAPIKey,
      workspaceId: ds.workspaceId,
    },
    logger,
    { useLocalInDev: true }
  );

  const workspaceFeatureFlags = await dustAPI.getWorkspaceFeatureFlags();
  if (workspaceFeatureFlags.isErr()) {
    logger.error("Error getting enabled feature flags for workspace.", {
      error: workspaceFeatureFlags.error,
    });

    throw new Error("Error getting enabled feature flags for workspace.");
  }

  return workspaceFeatureFlags.value;
}

export const getEnabledFeatureFlagsMemoized = cacheWithRedis(
  getEnabledFeatureFlags,
  (connector: ConnectorResource) => {
    return `enabled-feature-flags-for-workspace-${connector.workspaceId}`;
  },
  // Caches data for 15 minutes to limit frequent API calls.
  // Note: Updates (e.g., feature flags update) may take up to 15 minutes to be reflected.
  15 * 10 * 1000
);
