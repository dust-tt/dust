import { createPlugin } from "@app/lib/api/poke/types";
import { computeWorkspaceStatistics } from "@app/lib/api/workspace_statistics";
import { DATASOURCE_QUOTA_PER_SEAT } from "@app/lib/plans/usage/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { fileSizeToHumanReadable } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";

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

    const activeSeats = await MembershipResource.countActiveSeatsInWorkspace(
      workspace.sId
    );

    return new Ok({
      display: "markdown",
      value: `
Limit is ${fileSizeToHumanReadable(activeSeats * DATASOURCE_QUOTA_PER_SEAT)} per datasource (${activeSeats} active seats x 1 GB per seat)

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
