import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { useTriggerExecutionModes } from "@app/hooks/useTriggerExecutionModes";
import type { TriggerExecutionMode } from "@app/types/assistant/triggers";
import {
  NO_TRIGGER_EXECUTION_MODE_AVAILABLE_MESSAGE,
  TRIGGER_EXECUTION_MODE_UNAVAILABLE_MESSAGES,
} from "@app/types/assistant/triggers";
import {
  Button,
  ContentMessage,
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
  currentExecutionMode: TriggerExecutionMode | null;
}

export function TriggerPoolSelector({
  name,
  isEditor,
  currentExecutionMode,
}: TriggerPoolSelectorProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const { field } = useController({ control, name });

  const { canUseExecutionMode, hasAvailableExecutionMode } =
    useTriggerExecutionModes({ currentExecutionMode });

  let restriction: string | null = null;
  if (!hasAvailableExecutionMode) {
    restriction = NO_TRIGGER_EXECUTION_MODE_AVAILABLE_MESSAGE;
  } else if (!canUseExecutionMode(field.value)) {
    restriction = TRIGGER_EXECUTION_MODE_UNAVAILABLE_MESSAGES[field.value];
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="trigger-pool">Credits</Label>
      <p className="text-sm text-muted-foreground">
        Which pool this trigger's runs take credits from.
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id="trigger-pool"
            variant="outline"
            isSelect
            className="w-fit"
            disabled={!isEditor || !hasAvailableExecutionMode}
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
              disabled={!isEditor || !canUseExecutionMode(value)}
              onClick={() => field.onChange(value)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {restriction && (
        <ContentMessage variant="info">{restriction}</ContentMessage>
      )}
    </div>
  );
}
