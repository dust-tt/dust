import { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { getHubspotProvider } from "@app/temporal/labs/connections/providers/hubspot";
import type { LabsConnectionProvider } from "@app/temporal/labs/connections/types";
import type { ModelId } from "@app/types";

const PROVIDERS: Record<string, LabsConnectionProvider> = {
  hubspot: getHubspotProvider(),
};

async function getConfiguration(configurationId: ModelId) {
  const configuration =
    await LabsConnectionsConfigurationResource.fetchByModelId(configurationId);
  if (!configuration) {
    throw new Error(`Configuration ${configurationId} not found`);
  }

  if (!configuration.isEnabled) {
    throw new Error(`Configuration ${configurationId} is not enabled`);
  }

  if (!configuration.dataSourceViewId) {
    throw new Error(
      `Configuration ${configurationId} has no data source view configured`
    );
  }

  return {
    configuration,
    provider: PROVIDERS[configuration.provider],
  };
}

export async function fullSyncLabsConnectionActivity(
  configurationId: ModelId
): Promise<void> {
  const { configuration, provider } = await getConfiguration(configurationId);

  const result = await provider.fullSync(configuration);
  if (result.isErr()) {
    throw result.error;
  }
}

export async function incrementalSyncLabsConnectionActivity(
  configurationId: ModelId
): Promise<void> {
  const { configuration, provider } = await getConfiguration(configurationId);

  const result = await provider.incrementalSync(
    configuration,
    configuration.lastSyncCursor
  );

  if (result.isErr()) {
    throw result.error;
  }

  if (result.value.cursor !== configuration.lastSyncCursor) {
    await configuration.setLastSyncCursor(result.value.cursor);
  }
}
