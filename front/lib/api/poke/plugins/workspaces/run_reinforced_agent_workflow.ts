import { createPlugin } from "@app/lib/api/poke/types";
import { startReinforcedAgentWorkspaceWorkflow } from "@app/temporal/reinforced_agent/client";
import { Err, Ok } from "@app/types/shared/result";

export const runReinforcedAgentWorkflowPlugin = createPlugin({
  manifest: {
    id: "run-reinforced-agent-workflow",
    name: "Run Reinforced Workflow",
    description:
      "Kick off a one-off reinforced agent workflow run for this workspace.",
    resourceTypes: ["workspaces"],
    args: {
      useBatchMode: {
        type: "boolean",
        label: "Batch mode",
        description: "Use batch LLM API (cheaper but slower).",
        variant: "checkbox",
        default: false,
      },
      includeAutoAgents: {
        type: "boolean",
        label: "Include auto agents",
        description:
          'When enabled, agents in "auto" mode are included via scoring. When disabled, only agents explicitly set to "on" are run.',
        variant: "checkbox",
        default: true,
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const result = await startReinforcedAgentWorkspaceWorkflow({
      workspaceId: workspace.sId,
      useBatchMode: args.useBatchMode,
      includeAutoAgents: args.includeAutoAgents,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
    const modeDesc = args.useBatchMode ? "batch" : "no batching";
    const autoDesc = args.includeAutoAgents
      ? "with auto agents"
      : "only explicit on agents";
    return new Ok({
      display: "text",
      value: `Reinforced agent workflow started in ${modeDesc} mode, ${autoDesc} (workflowId: ${result.value}).`,
    });
  },
});
