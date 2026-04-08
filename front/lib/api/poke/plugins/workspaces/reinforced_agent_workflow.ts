import { createPlugin } from "@app/lib/api/poke/types";
import {
  launchReinforcedAgentWorkspaceCron,
  stopReinforcedAgentWorkspaceCron,
} from "@app/temporal/reinforced_agent/client";
import { Err, Ok } from "@app/types/shared/result";

export const reinforcedAgentWorkflowPlugin = createPlugin({
  manifest: {
    id: "reinforced-agent-workflow",
    name: "Start/Stop Reinforced Agents Workflow",
    description:
      "Start or stop the reinforced agent cron workflow for this workspace.",
    resourceTypes: ["workspaces"],
    args: {
      action: {
        type: "enum",
        label: "Action",
        description: "Start cron (nightly schedule) or Stop cron.",
        values: [
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
