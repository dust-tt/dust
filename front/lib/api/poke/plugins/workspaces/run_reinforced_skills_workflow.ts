import { createPlugin } from "@app/lib/api/poke/types";
import { startReinforcedSkillsWorkspaceWorkflow } from "@app/temporal/reinforcement/client";
import { Err, Ok } from "@app/types/shared/result";

export const runReinforcedSkillsWorkflowPlugin = createPlugin({
  manifest: {
    id: "run-reinforced-skills-workflow",
    name: "Run Reinforced Skills Workflow",
    description:
      "Kick off a one-off reinforced skills workflow run for this workspace.",
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
    const result = await startReinforcedSkillsWorkspaceWorkflow({
      workspaceId: workspace.sId,
      useBatchMode: args.useBatchMode,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
    const modeDesc = args.useBatchMode ? "batch" : "no batching";
    return new Ok({
      display: "text",
      value: `Reinforced skills workflow started in ${modeDesc} mode (workflowId: ${result.value}).`,
    });
  },
});
