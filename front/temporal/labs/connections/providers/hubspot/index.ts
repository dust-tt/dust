import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { syncHubspotConnection } from "@app/temporal/labs/connections/providers/hubspot/sync";
import type { LabsConnectionProvider } from "@app/temporal/labs/connections/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export function getHubspotProvider(): LabsConnectionProvider {
  return {
    fullSync: async (configuration: LabsConnectionsConfigurationResource) => {
      if (!configuration.credentialId) {
        return new Err(new Error("No credential ID configured"));
      }
      if (!configuration.dataSourceViewId) {
        return new Err(new Error("No data source view configured"));
      }

      return syncHubspotConnection(configuration);
    },
    incrementalSync: async (
      configuration: LabsConnectionsConfigurationResource,
      _cursor: string | null
    ): Promise<Result<{ cursor: string | null }, Error>> => {
      if (!configuration.credentialId) {
        return new Err(new Error("No credential ID configured"));
      }
      if (!configuration.dataSourceViewId) {
        return new Err(new Error("No data source view configured"));
      }

      const result = await syncHubspotConnection(configuration, _cursor);
      if (result.isErr()) {
        return result;
      }

      // Return the current timestamp as the cursor for the next sync
      return new Ok({ cursor: new Date().toISOString() });
    },
  };
}
