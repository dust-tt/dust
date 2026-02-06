import { createPlugin } from "@app/lib/api/poke/types";
import { Err, Ok } from "@app/types";

export const datasourceRetrievalTreemapPlugin = createPlugin({
  manifest: {
    id: "datasource-retrieval-treemap",
    name: "Datasource Retrieval Treemap",
    description: "View which datasources this agent retrieves documents from",
    resourceTypes: ["agents"],
    args: {},
  },
  execute: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const workspace = auth.getNonNullableWorkspace();

    return new Ok({
      display: "component",
      component: "datasourceRetrievalTreemap",
      props: {
        workspaceId: workspace.sId,
        agentConfigurationId: resource.sId,
        period: 30,
      },
    });
  },
  isApplicableTo: (_auth, resource) => resource?.status === "active",
});
