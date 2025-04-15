import { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { syncHubspotConnection } from "@app/temporal/labs/connections/utils/hubspot";
import type { ModelId } from "@app/types";

export async function syncLabsConnectionActivity(
  configurationId: ModelId
): Promise<void> {
  const configuration =
    await LabsConnectionsConfigurationResource.fetchByModelId(configurationId);
  if (!configuration) {
    throw new Error(`Configuration ${configurationId} not found`);
  }

  if (!configuration.isEnabled) {
    return;
  }

  if (!configuration.dataSourceViewId) {
    throw new Error(
      `Configuration ${configurationId} has no data source view configured`
    );
  }

  switch (configuration.provider) {
    case "hubspot":
      await syncHubspotConnection(configuration);
      break;
    default:
      throw new Error(`Unknown provider ${configuration.provider}`);
  }
}
