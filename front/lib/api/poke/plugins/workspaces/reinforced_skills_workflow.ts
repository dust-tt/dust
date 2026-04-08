import { createPlugin } from "@app/lib/api/poke/types";
import {
  launchReinforcedSkillsWorkspaceCron,
  stopReinforcedSkillsWorkspaceCron,
} from "@app/temporal/reinforced_skills/client";
import { Err, Ok } from "@app/types/shared/result";

export const reinforcedSkillsWorkflowPlugin = createPlugin({
  manifest: {
    id: "reinforced-skills-workflow",
    name: "Start/Stop Reinforced Skills Workflow",
    description:
      "Start or stop the reinforced skills cron workflow for this workspace.",
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
        const result = await launchReinforcedSkillsWorkspaceCron({
          workspaceId: workspace.sId,
        });
        if (result.isErr()) {
          return new Err(result.error);
        }
        return new Ok({
          display: "text",
          value: `Reinforced skills cron workflow started for workspace ${workspace.sId}.`,
        });
      }
      case "stop-cron": {
        await stopReinforcedSkillsWorkspaceCron({
          workspaceId: workspace.sId,
          stopReason: "Stopped via poke plugin",
        });
        return new Ok({
          display: "text",
          value: `Reinforced skills cron workflow stopped for workspace ${workspace.sId}.`,
        });
      }
      default:
        return new Err(new Error(`Unknown action: ${action}`));
    }
  },
});
