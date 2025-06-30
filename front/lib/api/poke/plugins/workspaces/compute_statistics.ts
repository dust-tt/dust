import { createPlugin } from "@app/lib/api/poke/types";
import { computeWorkspaceStatistics } from "@app/lib/api/workspace_statistics";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import { Err, Ok } from "@app/types";

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

    const statsRes = await computeWorkspaceStatistics(auth);
    if (statsRes.isErr()) {
      return new Err(statsRes.error);
    }

    const stats = statsRes.value;

    const activeSeats = await countActiveSeatsInWorkspace(workspace.sId);

    return new Ok({
      display: "markdown",
      value: `
${activeSeats} Gb per datasource (${activeSeats} active seats x 1 Gb per seat)

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
