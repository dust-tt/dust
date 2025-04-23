import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { syncJiraConnection } from "@app/temporal/labs/connections/providers/jira/sync";
import type { LabsConnectionProvider } from "@app/temporal/labs/connections/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export function getJiraProvider(): LabsConnectionProvider {
  return {
    fullSync: async (configuration: LabsConnectionsConfigurationResource) => {
      if (!configuration.credentialId) {
        return new Err(new Error("No credential ID configured"));
      }
      if (!configuration.dataSourceViewId) {
        return new Err(new Error("No data source view configured"));
      }

      return syncJiraConnection(configuration);
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

      const result = await syncJiraConnection(configuration, _cursor);
      if (result.isErr()) {
        return result;
      }

      // Return the current timestamp as the cursor for the next sync
      return new Ok({ cursor: new Date().toISOString() });
    },
  };
}
