import { createPlugin } from "@app/lib/api/poke/types";
import { computeWorkspaceStatistics } from "@app/lib/api/workspace_statistics";
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

    return new Ok({
      display: "json",
      value: stats,
    });
  },
});
