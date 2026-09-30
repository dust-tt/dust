import { computeDataSourceStatistics } from "@app/lib/api/data_sources";
import { createPlugin } from "@app/lib/api/poke/types";
import { formatFileSize } from "@app/lib/i18n/format";
import { Err, Ok } from "@app/types/shared/result";

export const computeStatsPlugin = createPlugin({
  manifest: {
    id: "compute-stats",
    name: "Compute statistics",
    description: "Gather statistics for the data source",
    resourceTypes: ["data_sources"],
    readonly: true,
    args: {},
    requiredRoles: ["support"],
  },
  execute: async (auth, dataSource) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const result = await computeDataSourceStatistics([dataSource]);
    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    const [{ name, text_size, document_count }] = result.value.data_sources;

    return new Ok({
      display: "json",
      value: {
        name,
        text_size: formatFileSize(text_size, { decimals: 2 }, "en-US"),
        document_count,
      },
    });
  },
});
