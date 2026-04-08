import { createPlugin } from "@app/lib/api/poke/types";
import { startReinforcementWorkspaceWorkflow } from "@app/temporal/reinforcement/client";
import { Err, Ok } from "@app/types/shared/result";

export const runReinforcementWorkflowPlugin = createPlugin({
  manifest: {
    id: "run-reinforcement-workflow",
    name: "Run Reinforcement Workflow",
    description:
      "Kick off a one-off reinforcement workflow run for this workspace.",
    resourceTypes: ["workspaces"],
    args: {
      useBatchMode: {
        type: "boolean",
        label: "Batch mode",
        description: "Use batch LLM API (cheaper but slower).",
        variant: "checkbox",
        default: false,
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const result = await startReinforcementWorkspaceWorkflow({
      workspaceId: workspace.sId,
      useBatchMode: args.useBatchMode,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
    const modeDesc = args.useBatchMode ? "batch" : "no batching";
    return new Ok({
      display: "text",
      value: `Reinforcement workflow started in ${modeDesc} mode (workflowId: ${result.value}).`,
    });
  },
});
