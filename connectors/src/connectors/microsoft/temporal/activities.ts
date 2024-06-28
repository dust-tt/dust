import type { ModelId } from "@dust-tt/types";

import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export async function fullSyncActivity({
  connectorId,
  dataSourceConfig,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
}): Promise<void> {
  logger.info(
    `To implement: full sync for connector ${connectorId} with config ${JSON.stringify(
      dataSourceConfig
    )}`
  );
}
