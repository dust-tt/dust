import { CoreAPI, Err, maxFileSizeToHumanReadable, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";

async function computeStatistics(dataSource: DataSourceResource) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  return coreAPI.getDataSourceStats({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
  });
}

export const computeStatsPlugin = createPlugin({
  manifest: {
    id: "compute-stats",
    name: "Compute statistics",
    description: "Gather statistics for the data source",
    resourceTypes: ["data_sources"],
    args: {},
  },
  execute: async (auth, dataSource) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const result = await computeStatistics(dataSource);
    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    const { name, text_size, document_count } = result.value.data_source;

    return new Ok({
      display: "json",
      value: {
        name,
        text_size: maxFileSizeToHumanReadable(text_size, 2),
        document_count,
      },
    });
  },
});
