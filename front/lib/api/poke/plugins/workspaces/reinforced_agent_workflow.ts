import { createPlugin } from "@app/lib/api/poke/types";
import {
  launchReinforcedAgentWorkspaceCron,
  startReinforcedAgentWorkspaceWorkflow,
  stopReinforcedAgentWorkspaceCron,
} from "@app/temporal/reinforced_agent/client";
import { Err, Ok } from "@app/types/shared/result";

export const reinforcedAgentWorkflowPlugin = createPlugin({
  manifest: {
    id: "reinforced-agent-workflow",
    name: "Reinforced Agent Workflow",
    description:
      "Run, start cron, or stop the reinforced agent workflow for this workspace.",
    resourceTypes: ["workspaces"],
    args: {
      action: {
        type: "enum",
        label: "Action",
        description:
          "Run now (one-off, no delay), Start cron (nightly schedule), or Stop cron.",
        values: [
          { label: "Run now (batch)", value: "run-now-batch" },
          { label: "Run now (no batching)", value: "run-now-no-batching" },
          { label: "Start cron", value: "start-cron" },
          { label: "Stop cron", value: "stop-cron" },
        ],
        multiple: false,
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const action = args.action[0];

    switch (action) {
      case "run-now-batch":
      case "run-now-no-batching": {
        const useBatchMode = action === "run-now-batch";
        const result = await startReinforcedAgentWorkspaceWorkflow({
          workspaceId: workspace.sId,
          useBatchMode,
        });
        if (result.isErr()) {
          return new Err(result.error);
        }
        return new Ok({
          display: "text",
          value: `Reinforced agent workflow started in ${useBatchMode ? "batch" : "no batching"} mode (workflowId: ${result.value}).`,
        });
      }
      case "start-cron": {
        const result = await launchReinforcedAgentWorkspaceCron({
          workspaceId: workspace.sId,
        });
        if (result.isErr()) {
          return new Err(result.error);
        }
        return new Ok({
          display: "text",
          value: `Reinforced agent cron workflow started for workspace ${workspace.sId}.`,
        });
      }
      case "stop-cron": {
        await stopReinforcedAgentWorkspaceCron({
          workspaceId: workspace.sId,
          stopReason: "Stopped via poke plugin",
        });
        return new Ok({
          display: "text",
          value: `Reinforced agent cron workflow stopped for workspace ${workspace.sId}.`,
        });
      }
      default:
        return new Err(new Error(`Unknown action: ${action}`));
    }
  },
});
