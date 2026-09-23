import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import { SliderToggle } from "@dust-tt/sparkle";
import { useController } from "react-hook-form";

export function AgentBuilderCostManagementBlock() {
  const { owner } = useAgentBuilderContext();
  const { creditSpendCheckpointEnabled } = useWorkspaceUsageStatus({ owner });
  const { field } = useController<
    AgentBuilderFormData,
    "ignoreCreditSpendThresholdAlert"
  >({
    name: "ignoreCreditSpendThresholdAlert",
  });

  // Nothing to bypass when the workspace has the checkpoint turned off.
  if (!creditSpendCheckpointEnabled) {
    return null;
  }

  return (
    <AgentBuilderSectionContainer title="Cost Management">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            Ignore credit spend threshold alert
          </span>
          <span className="text-xs text-muted-foreground">
            Conversations with this agent will not pause to ask for confirmation
            when they cross the workspace's credit spend checkpoint.
          </span>
        </div>
        <SliderToggle
          selected={field.value}
          onClick={() => field.onChange(!field.value)}
        />
      </div>
    </AgentBuilderSectionContainer>
  );
}
