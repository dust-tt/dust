import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SettingSectionContainer } from "@app/components/agent_builder/shared/SettingSectionContainer";
import { useAuth } from "@app/lib/auth/AuthContext";
import { SliderToggle } from "@dust-tt/sparkle";
import { useController } from "react-hook-form";

export function CostManagementSection() {
  const { isManager } = useAuth();
  const { field } = useController<
    AgentBuilderFormData,
    "agentSettings.ignoreCreditSpendThresholdAlert"
  >({
    name: "agentSettings.ignoreCreditSpendThresholdAlert",
  });

  // Bypassing the spend alert is a cost decision, reserved to people who manage the workspace.
  if (!isManager) {
    return null;
  }

  return (
    <SettingSectionContainer title="Cost Management">
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
    </SettingSectionContainer>
  );
}
