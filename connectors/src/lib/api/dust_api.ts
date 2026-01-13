import { DustAPI } from "@dust-tt/client";

import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types";

/**
 * Creates a DustAPI instance for the given data source configuration.
 * Uses the public Front API URL by default.
 *
 * @param dataSourceConfig - The data source configuration
 * @param useInternalAPI - If true, uses the internal API URL instead of the public one
 * @returns A configured DustAPI instance
 */
export function getDustAPI(
  dataSourceConfig: DataSourceConfig,
  useInternalAPI = false
): DustAPI {
  return new DustAPI(
    {
      url: useInternalAPI
        ? apiConfig.getDustFrontInternalAPIUrl()
        : apiConfig.getDustFrontAPIUrl(),
    },
    {
      apiKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
    },
    logger
  );
}
