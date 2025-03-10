import {
  concurrentExecutor,
  Err,
  maxFileSizeToHumanReadable,
  Ok,
  removeNulls,
} from "@dust-tt/types";
import assert from "assert";

import { computeDataSourceStatistics } from "@app/lib/api/data_sources";
import { createPlugin } from "@app/lib/api/poke/types";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";

type WorkspaceStats = {
  dataSources: {
    name: string;
    text_size: string;
    document_count: number;
  }[];
  document_count: number;
  text_size: number;
};

export const computeWorkspaceStatsPlugin = createPlugin({
  manifest: {
    id: "compute-workspace-stats",
    name: "Compute Workspace Statistics",
    description: "Gather statistics for the workspace",
    resourceTypes: ["workspaces"],
    args: {},
  },
  execute: async (auth, workspace) => {
    if (!workspace) {
      return new Err(new Error("Workspace not found."));
    }

    // Exclude conversation data sources on purpose. It would be too heavy to compute.
    const dataSources = await DataSourceResource.listByWorkspace(auth, {
      includeDeleted: true,
    });

    const results = await concurrentExecutor(
      dataSources,
      async (dataSource) => computeDataSourceStatistics(dataSource),
      { concurrency: 10 }
    );

    const hasError = results.some((r) => r.isErr());
    if (hasError) {
      return new Err(
        new Error("Error computing statistics.", {
          cause: removeNulls(
            results.map((r) => (r.isErr() ? r.error.message : null))
          ),
        })
      );
    }

    const stats = results.reduce<WorkspaceStats>(
      (acc, r) => {
        // Errors are filtered out above.
        assert(r.isOk());

        const { name, text_size, document_count } = r.value.data_source;

        return {
          text_size: acc.text_size + text_size,
          document_count: acc.document_count + document_count,
          dataSources: [
            ...acc.dataSources,
            {
              name,
              text_size: maxFileSizeToHumanReadable(text_size, 2),
              document_count,
            },
          ],
        };
      },
      { text_size: 0, document_count: 0, dataSources: [] }
    );

    return new Ok({
      display: "json",
      value: {
        ...stats,
        text_size: maxFileSizeToHumanReadable(stats.text_size, 2),
      },
    });
  },
});
