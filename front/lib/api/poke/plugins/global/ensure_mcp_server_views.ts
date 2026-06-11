import { createPlugin } from "@app/lib/api/poke/types";
import { launchEnsureMCPServerViewsWorkflow } from "@app/temporal/ensure_mcp_server_views/client";
import { Err, Ok } from "@app/types/shared/result";

export const ensureMCPServerViewsPlugin = createPlugin({
  manifest: {
    id: "ensure-mcp-server-views",
    name: "Ensure MCP Server Views",
    description:
      "Launch the Temporal workflow that ensures auto MCP server views exist in every workspace. " +
      "Run it after changing global feature flags or rolling out new auto MCP servers. " +
      "The workflow is resumable and dedupes on a fixed workflow id.",
    resourceTypes: ["global"],
    args: {},
  },
  execute: async () => {
    const launchResult = await launchEnsureMCPServerViewsWorkflow();
    if (launchResult.isErr()) {
      return new Err(launchResult.error);
    }

    const { workflowId, outcome } = launchResult.value;

    return new Ok({
      display: "text",
      value:
        outcome === "started"
          ? `MCP server view backfill workflow started (${workflowId}).`
          : `MCP server view backfill workflow is already running (${workflowId}).`,
    });
  },
});
