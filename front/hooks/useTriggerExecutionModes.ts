import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type { TriggerExecutionMode } from "@app/types/assistant/triggers";
import { availableTriggerExecutionModes } from "@app/types/assistant/triggers";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";

export function useTriggerExecutionModes({
  currentExecutionMode,
}: {
  currentExecutionMode?: TriggerExecutionMode | null;
} = {}): {
  canUseExecutionMode: (executionMode: TriggerExecutionMode) => boolean;
  hasAvailableExecutionMode: boolean;
} {
  const { subscription } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const { hasPermission } = useWorkspacePermissions();

  const executionModes = availableTriggerExecutionModes({
    isPlanCreditPriced: isCreditPricedPlan(subscription.plan),
    hasLegacyTriggerLimits: hasFeature("legacy_trigger_limits"),
    canUseWorkspacePool: hasPermission("use_workspace_pool", "trigger"),
    currentExecutionMode,
  });

  return {
    canUseExecutionMode: (executionMode) =>
      executionModes.includes(executionMode),
    hasAvailableExecutionMode: executionModes.length > 0,
  };
}

export function useCanUseSelectedExecutionMode({
  control,
  currentExecutionMode,
}: {
  control: Control<TriggerViewsSheetFormValues>;
  currentExecutionMode: TriggerExecutionMode | null;
}): boolean {
  const { canUseExecutionMode } = useTriggerExecutionModes({
    currentExecutionMode,
  });

  const type = useWatch({ control, name: "type" });
  const scheduleExecutionMode = useWatch({
    control,
    name: "schedule.executionMode",
  });
  const webhookExecutionMode = useWatch({
    control,
    name: "webhook.executionMode",
  });

  return canUseExecutionMode(
    type === "schedule" ? scheduleExecutionMode : webhookExecutionMode
  );
}
