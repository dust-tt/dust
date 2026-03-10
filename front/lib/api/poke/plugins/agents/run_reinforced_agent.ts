import { createPlugin } from "@app/lib/api/poke/types";
import { startReinforcedAgentForAgentWorkflow } from "@app/temporal/reinforced_agent/client";
import { Err, Ok } from "@app/types/shared/result";

export const runReinforcedAgentPlugin = createPlugin({
  manifest: {
    id: "run-reinforced-agent",
    name: "Run Reinforced Agent",
    description:
      "Analyze recent conversations for this agent and suggest improvements to its configuration",
    resourceTypes: ["agents"],
    args: {},
  },
  execute: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const workspace = auth.getNonNullableWorkspace();

    const result = await startReinforcedAgentForAgentWorkflow({
      workspaceId: workspace.sId,
      agentConfigurationId: resource.sId,
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
