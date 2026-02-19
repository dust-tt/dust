import { softDeleteDataSourceAndLaunchScrubWorkflow } from "@app/lib/api/data_sources";
import { createPlugin } from "@app/lib/api/poke/types";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types/shared/result";

export const deleteDataSourcePlugin = createPlugin({
  manifest: {
    id: "delete-data-source",
    name: "Delete Data Source",
    warning: "This is a destructive action.",
    description:
      "Permanently delete this data source. This action cannot be undone.",
    resourceTypes: ["data_sources"],
    args: {
      forceDelete: {
        type: "boolean",
        label: "🔴 Force delete (hard delete) - DANGEROUS",
        description:
          "WARNING: This will immediately and permanently delete ALL files and bypass safety checks. The data will be unrecoverable. Only use if you are absolutely certain.",
      },
    },
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const dataSourceViews = await DataSourceViewResource.listForDataSources(
      auth,
      [dataSource]
    );

    const viewsUsageByAgentsRes = await concurrentExecutor(
      dataSourceViews,
      (view) => view.getUsagesByAgents(auth),
      { concurrency: 5 }
    );

    const viewsUsedByAgentsName = viewsUsageByAgentsRes.reduce(
      (acc, usageRes) => {
        if (usageRes.isOk() && usageRes.value.count > 0) {
          usageRes.value.agents
            .map((a) => a.name)
            .forEach((name) => acc.add(name));
        }
        return acc;
      },
      new Set<string>()
    );

    const { forceDelete } = args;
    if (!forceDelete && viewsUsedByAgentsName.size > 0) {
      return new Err(
        new Error(
          `Cannot delete: This data source is being used by ${viewsUsedByAgentsName.size} agent(s) [${Array.from(viewsUsedByAgentsName).join(", ")}]. Enable "Force delete" to bypass this safety check.`
        )
      );
    }

    const delRes = await softDeleteDataSourceAndLaunchScrubWorkflow(auth, {
      dataSource,
    });

    if (delRes.isErr()) {
      return new Err(
        new Error(`Failed to delete data source: ${delRes.error.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: `✅ Data source ${dataSource.sId} has been successfully deleted (soft delete), along with the associated tools in the following agents: ${Array.from(viewsUsedByAgentsName).join(", ")}`,
    });
  },
});
