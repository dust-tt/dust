import { Err, maxFileSizeToHumanReadable, Ok } from "@dust-tt/types";

import { computeDataSourceStatistics } from "@app/lib/api/data_sources";
import { createPlugin } from "@app/lib/api/poke/types";

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

    const result = await computeDataSourceStatistics(dataSource);
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
