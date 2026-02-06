import { createPlugin } from "@app/lib/api/poke/types";
import { Err, Ok } from "@app/types";

export const workspaceDatasourceRetrievalTreemapPlugin = createPlugin({
  manifest: {
    id: "workspace-datasource-retrieval-treemap",
    name: "Workspace Datasource Retrieval Treemap",
    description:
      "View which datasources are retrieved across all agents in this workspace",
    resourceTypes: ["workspaces"],
    args: {},
  },
  execute: async (auth, workspace) => {
    if (!workspace) {
      return new Err(new Error("Workspace not found"));
    }

    return new Ok({
      display: "component",
      component: "workspaceDatasourceRetrievalTreemap",
      props: {
        workspaceId: workspace.sId,
        period: 30,
      },
    });
  },
});
