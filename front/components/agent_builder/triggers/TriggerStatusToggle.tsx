import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { TRIGGER_STATUS_LABELS } from "@app/components/triggers/TriggerStatusChip";
import { useAuth } from "@app/lib/auth/AuthContext";
import { getTriggerStatusOwner } from "@app/types/assistant/triggers";
import { Label, SliderToggle, Tooltip } from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

interface TriggerStatusToggleProps {
  name: "schedule.status" | "webhook.status";
  isEditor: boolean;
}

export function TriggerStatusToggle({
  name,
  isEditor,
}: TriggerStatusToggleProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field: { value: status, onChange: setStatus },
  } = useController({ control, name });
  const { isManager } = useAuth();

  const isEnabled = status === "enabled";
  const statusOwner = getTriggerStatusOwner(status);
  // Non-managers cannot flip a manager lock; nobody edits system-owned statuses.
  const isStatusLocked =
    statusOwner === "system" || (statusOwner === "admin" && !isManager);
  const statusLabel = TRIGGER_STATUS_LABELS[status];

  const toggle = (
    <SliderToggle
      disabled={!isEditor || isStatusLocked}
      selected={isEnabled}
      onClick={() => setStatus(isEnabled ? "disabled" : "enabled")}
    />
  );

  return (
    <div className="space-y-1">
      <Label>Status</Label>
      <div className="flex flex-row items-center gap-2">
        <span className="min-w-16 whitespace-nowrap">{statusLabel}</span>
        {isStatusLocked ? (
          <Tooltip
            label={
              statusOwner === "system"
                ? "This trigger's status is managed by Dust."
                : "Only a manager or an admin can re-enable this trigger."
            }
            trigger={<div>{toggle}</div>}
          />
        ) : (
          toggle
        )}
      </div>
    </div>
  );
}
