import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types";
import { DustAPI } from "@dust-tt/client";

/**
 * Creates a DustAPI instance for the given data source configuration,
 * targeting the front API URL.
 *
 * @param dataSourceConfig - The data source configuration
 * @returns A configured DustAPI instance
 */
export function getDustAPI(dataSourceConfig: DataSourceConfig): DustAPI {
  return new DustAPI(
    {
      url: apiConfig.getDustFrontAPIUrl(),
    },
    {
      apiKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
    },
    logger
  );
}
