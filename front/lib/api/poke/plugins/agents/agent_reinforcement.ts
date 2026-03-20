import { createPlugin } from "@app/lib/api/poke/types";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { AgentReinforcementMode } from "@app/types/assistant/agent";
import { AGENT_REINFORCEMENT_MODES } from "@app/types/assistant/agent";
import { Err, Ok } from "@app/types/shared/result";

function isAgentReinforcementMode(
  value: string
): value is AgentReinforcementMode {
  return (AGENT_REINFORCEMENT_MODES as readonly string[]).includes(value);
}

export const agentReinforcementPlugin = createPlugin({
  manifest: {
    id: "agent-reinforcement",
    name: "Change Agent Reinforcement",
    description: "Change the reinforcement mode for this agent (on, off, auto)",
    resourceTypes: ["agents"],
    args: {
      reinforcement: {
        type: "enum",
        label: "Reinforcement Mode",
        description: "The reinforcement mode for this agent",
        async: true,
        values: [],
        multiple: false,
      },
    },
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const currentMode = resource.reinforcement ?? "auto";

    return new Ok({
      reinforcement: AGENT_REINFORCEMENT_MODES.map((mode) => ({
        label: mode,
        value: mode,
        checked: mode === currentMode,
      })),
    });
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Agent configuration not found"));
    }

    const reinforcement = args.reinforcement?.[0];
    if (!reinforcement || !isAgentReinforcementMode(reinforcement)) {
      return new Err(new Error("Invalid reinforcement mode"));
    }

    await AgentConfigurationModel.update(
      { reinforcement },
      {
        where: {
          sId: resource.sId,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );

    return new Ok({
      display: "text",
      value: `Agent reinforcement mode set to "${reinforcement}".`,
    });
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.status === "active";
  },
});
