import { createPlugin } from "@app/lib/api/poke/types";
import {
  launchReinforcementWorkspaceCron,
  stopReinforcementWorkspaceCron,
} from "@app/temporal/reinforcement/client";
import { Err, Ok } from "@app/types/shared/result";

export const reinforcementWorkflowPlugin = createPlugin({
  manifest: {
    id: "reinforcement-workflow",
    name: "Start/Stop Reinforcement Workflow",
    description:
      "Start or stop the reinforcement cron workflow for this workspace.",
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
        const result = await launchReinforcementWorkspaceCron({
          workspaceId: workspace.sId,
        });
        if (result.isErr()) {
          return new Err(result.error);
        }
        return new Ok({
          display: "text",
          value: `Reinforcement cron workflow started for workspace ${workspace.sId}.`,
        });
      }
      case "stop-cron": {
        await stopReinforcementWorkspaceCron({
          workspaceId: workspace.sId,
          stopReason: "Stopped via poke plugin",
        });
        return new Ok({
          display: "text",
          value: `Reinforcement cron workflow stopped for workspace ${workspace.sId}.`,
        });
      }
      default:
        return new Err(new Error(`Unknown action: ${action}`));
    }
  },
});
