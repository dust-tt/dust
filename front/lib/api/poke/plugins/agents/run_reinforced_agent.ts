import { createPlugin } from "@app/lib/api/poke/types";
import { DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS } from "@app/lib/reinforced_agent/constants";
import { startReinforcedAgentForAgentWorkflow } from "@app/temporal/reinforced_agent/client";
import { Err, Ok } from "@app/types/shared/result";

export const runReinforcedAgentPlugin = createPlugin({
  manifest: {
    id: "run-reinforced-agent",
    name: "Run Reinforced Agent",
    description:
      "Analyze recent conversations for this agent and suggest improvements to its configuration",
    resourceTypes: ["agents"],
    args: {
      useBatchMode: {
        type: "boolean",
        label: "Use batch mode",
        description:
          "Process conversations via batch LLM API (slower but cheaper). Uncheck to use streaming (faster but more expensive).",
      },
      conversationLookbackDays: {
        type: "number",
        variant: "text",
        label: "Days of conversations to analyze",
        description: "Number of past days of conversations to analyze.",
        default: DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
      },
      disableNotifications: {
        type: "boolean",
        label: "Disable notifications",
        description:
          "Disable sending notifications to agent editors when new suggestions are created.",
        default: true,
      },
    },
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const workspace = auth.getNonNullableWorkspace();

    const result = await startReinforcedAgentForAgentWorkflow({
      workspaceId: workspace.sId,
      agentConfigurationId: resource.sId,
      useBatchMode: args.useBatchMode,
      conversationLookbackDays: args.conversationLookbackDays,
      disableNotifications: args.disableNotifications,
    });

    if (result.isErr()) {
      return result;
    }

    return new Ok({
      display: "text",
      value: `Reinforced agent workflow started (workflowId: ${result.value}).`,
    });
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.status === "active";
  },
});
