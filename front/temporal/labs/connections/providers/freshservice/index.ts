import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { syncFreshServiceConnection } from "@app/temporal/labs/connections/providers/freshservice/sync";
import type { LabsConnectionProvider } from "@app/temporal/labs/connections/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export function getFreshServiceProvider(): LabsConnectionProvider {
  return {
    fullSync: async (configuration: LabsConnectionsConfigurationResource) => {
      if (!configuration.credentialId) {
        return new Err(new Error("No credential ID configured"));
      }
      if (!configuration.dataSourceViewId) {
        return new Err(new Error("No data source view configured"));
      }

      return syncFreshServiceConnection(configuration);
    },

    incrementalSync: async (
      configuration: LabsConnectionsConfigurationResource,
      cursor: string | null
    ): Promise<Result<{ cursor: string | null }, Error>> => {
      if (!configuration.credentialId) {
        return new Err(new Error("No credential ID configured"));
      }
      if (!configuration.dataSourceViewId) {
        return new Err(new Error("No data source view configured"));
      }

      const result = await syncFreshServiceConnection(configuration, cursor);
      if (result.isErr()) {
        return result;
      }

      // Return the current timestamp as the cursor for the next sync
      return new Ok({ cursor: new Date().toISOString() });
    },
  };
}
