import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type { TriggerExecutionMode } from "@app/types/assistant/triggers";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Label,
} from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

const POOL_OPTIONS: { value: TriggerExecutionMode; label: string }[] = [
  { value: "user_pool", label: "My credits" },
  { value: "workspace_pool", label: "Workspace credits" },
];

interface TriggerPoolSelectorProps {
  name: "schedule.executionMode" | "webhook.executionMode";
  isEditor: boolean;
}

export function TriggerPoolSelector({
  name,
  isEditor,
}: TriggerPoolSelectorProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const { field } = useController({ control, name });
  const { hasFeature } = useFeatureFlags();
  const { hasPermission } = useWorkspacePermissions();

  if (!hasFeature("trigger_pool_choice")) {
    return null;
  }

  const canSetPool = hasPermission("use_workspace_pool", "trigger");

  return (
    <div className="space-y-1">
      <Label htmlFor="trigger-pool">Credits</Label>
      <p className="text-sm text-muted-foreground">
        Where the credits spent by this trigger's runs are taken from.
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id="trigger-pool"
            variant="outline"
            isSelect
            className="w-fit"
            disabled={!isEditor || !canSetPool}
            label={
              POOL_OPTIONS.find((option) => option.value === field.value)
                ?.label ?? "Select"
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel label="Charge to" />
          {POOL_OPTIONS.map(({ value, label }) => (
            <DropdownMenuItem
              key={value}
              label={label}
              disabled={!isEditor || !canSetPool}
              onClick={() => field.onChange(value)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
