import {
  hardDeleteDataSource,
  softDeleteDataSourceAndLaunchScrubWorkflow,
} from "@app/lib/api/data_sources";
import { createPlugin } from "@app/lib/api/poke/types";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { Err, Ok } from "@app/types";

export const deleteDataSourcePlugin = createPlugin({
  manifest: {
    id: "delete-data-source",
    name: "⚠️ Delete Data Source",
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

    const { forceDelete } = args;

    try {
      if (!forceDelete) {
        const dataSourceViews = await DataSourceViewResource.listForDataSources(
          auth,
          [dataSource]
        );
        const viewsUsageByAgentsRes = await Promise.all(
          dataSourceViews.map((view) => view.getUsagesByAgents(auth))
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

        if (viewsUsedByAgentsName.size > 0) {
          return new Err(
            new Error(
              `Cannot delete: This data source is being used by ${viewsUsedByAgentsName.size} agent(s) [${Array.from(viewsUsedByAgentsName).join(", ")}]. Enable "Force delete" to bypass this safety check.`
            )
          );
        }

        const delRes = await softDeleteDataSourceAndLaunchScrubWorkflow(
          auth,
          dataSource
        );
        if (delRes.isErr()) {
          return new Err(
            new Error(`Failed to delete data source: ${delRes.error.message}`)
          );
        }

        return new Ok({
          display: "text",
          value: `✅ Data source ${dataSource.sId} has been successfully deleted (soft delete).`,
        });
      } else {
        await hardDeleteDataSource(auth, dataSource);

        return new Ok({
          display: "text",
          value: `🔴 PERMANENT DELETION COMPLETED. Data source ${dataSource.sId} has been permanently hard deleted. All files have been removed and this action cannot be undone.`,
        });
      }
    } catch (error) {
      return new Err(new Error(`❌ Failed to delete data source: ${error}`));
    }
  },
});
