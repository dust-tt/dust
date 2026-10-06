import type { AgentBuilderFormData } from "@app/components/agent_builder/agentBuilderFormSchema";
import { SettingSectionContainer } from "@app/components/agent_builder/shared/SettingSectionContainer";
import { useAuth } from "@app/lib/auth/AuthContext";
import { SliderToggle } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useController } from "react-hook-form";

export function CostManagementSection() {
  const { t } = useLingui();
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
    <SettingSectionContainer title={t`Cost Management`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            <Trans>Ignore credit spend threshold alert</Trans>
          </span>
          <span className="text-xs text-muted-foreground">
            <Trans>
              Conversations with this agent will not pause to ask for
              confirmation when they cross the workspace's credit spend
              checkpoint.
            </Trans>
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
