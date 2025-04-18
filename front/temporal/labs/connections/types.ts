import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import type { Result } from "@app/types";

export interface LabsConnectionProvider {
  fullSync(
    configuration: LabsConnectionsConfigurationResource
  ): Promise<Result<void, Error>>;

  incrementalSync(
    configuration: LabsConnectionsConfigurationResource,
    cursor: string | null
  ): Promise<Result<{ cursor: string | null }, Error>>;
}
