import { createPlugin } from "@app/lib/api/poke/types";
import {
  launchReinforcedAgentWorkspaceCron,
  stopReinforcedAgentWorkspaceCron,
} from "@app/temporal/reinforced_agent/client";
import { Err, Ok } from "@app/types/shared/result";

export const reinforcedAgentWorkflowPlugin = createPlugin({
  manifest: {
    id: "reinforced-agent-workflow",
    name: "Reinforced Agent Workflow",
    description:
      "Start or stop the nightly reinforced agent cron workflow for this workspace.",
    resourceTypes: ["workspaces"],
    args: {
      action: {
        type: "enum",
        label: "Action",
        description: "Whether to start or stop the cron workflow.",
        values: [
          { label: "Start", value: "start" },
          { label: "Stop", value: "stop" },
        ],
        multiple: false,
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const action = args.action[0];

    switch (action) {
      case "start": {
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
      case "stop": {
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
