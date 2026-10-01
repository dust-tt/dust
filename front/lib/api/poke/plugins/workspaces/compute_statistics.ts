import { createPlugin } from "@app/lib/api/poke/types";
import { countActiveSeatsForWorkspace } from "@app/lib/api/workspace_seats";
import { computeWorkspaceStatistics } from "@app/lib/api/workspace_statistics";
import { formatFileSize } from "@app/lib/i18n/format";
import { DATASOURCE_QUOTA_PER_SEAT } from "@app/lib/plans/usage/types";
import { Err, Ok } from "@app/types/shared/result";

export const computeWorkspaceStatsPlugin = createPlugin({
  manifest: {
    id: "compute-workspace-stats",
    name: "Compute Workspace Statistics",
    description: "Gather statistics for the workspace",
    resourceTypes: ["workspaces"],
    readonly: true,
    args: {},
    requiredRoles: ["support"],
  },
  execute: async (auth, workspace) => {
    if (!workspace) {
      return new Err(new Error("Workspace not found."));
    }

    const statsRes = await computeWorkspaceStatistics(auth);
    if (statsRes.isErr()) {
      return new Err(statsRes.error);
    }

    const stats = statsRes.value;

    const activeSeats = await countActiveSeatsForWorkspace(workspace.sId);

    return new Ok({
      display: "markdown",
      value: `
Limit is ${formatFileSize(activeSeats * DATASOURCE_QUOTA_PER_SEAT, { decimals: 0 }, "en-US")} per datasource (${activeSeats} active seats x 1 GB per seat)

| Datasource | Document count | Total size |
|------------|----------------|------------|
| **Total** | **${stats.document_count}** | **${stats.text_size}** |
${stats.dataSources
  .map((ds) => `| ${ds.name} | ${ds.document_count} | ${ds.text_size} |`)
  .join("\n")}
      `,
    });
  },
});
