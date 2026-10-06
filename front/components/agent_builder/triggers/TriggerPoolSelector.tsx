import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { useTriggerExecutionModes } from "@app/hooks/useTriggerExecutionModes";
import type { TriggerExecutionMode } from "@app/types/assistant/triggers";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useController, useFormContext } from "react-hook-form";

const POOL_OPTIONS: {
  value: TriggerExecutionMode;
  label: MessageDescriptor;
}[] = [
  { value: "user_pool", label: msg`My credits` },
  { value: "workspace_pool", label: msg`Workspace credits` },
];

const NO_EXECUTION_MODE_AVAILABLE_MESSAGE = msg`Automations on your plan must be charged to the workspace credit pool, which you don't have permission to use. Ask a workspace admin for access.`;

const EXECUTION_MODE_UNAVAILABLE_MESSAGES: Record<
  TriggerExecutionMode,
  MessageDescriptor
> = {
  user_pool: msg`Your plan doesn't support charging automations to personal credits.`,
  workspace_pool: msg`You don't have permission to charge automations to the workspace credit pool.`,
};

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
  const { t } = useLingui();
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const { field } = useController({ control, name });

  const { canUseExecutionMode, hasAvailableExecutionMode } =
    useTriggerExecutionModes({ currentExecutionMode });

  let restriction: string | null = null;
  if (!hasAvailableExecutionMode) {
    restriction = t(NO_EXECUTION_MODE_AVAILABLE_MESSAGE);
  } else if (!canUseExecutionMode(field.value)) {
    restriction = t(EXECUTION_MODE_UNAVAILABLE_MESSAGES[field.value]);
  }

  const selectedOption = POOL_OPTIONS.find(
    (option) => option.value === field.value
  );

  return (
    <div className="space-y-1">
      <Label htmlFor="trigger-pool">
        <Trans>Credits</Trans>
      </Label>
      <p className="text-sm text-muted-foreground">
        <Trans>Which pool this trigger's runs take credits from.</Trans>
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
              selectedOption
                ? t(selectedOption.label)
                : t({
                    message: "Select",
                    context: "placeholder, no option selected",
                  })
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel label={t`Charge to`} />
          {POOL_OPTIONS.map(({ value, label }) => (
            <DropdownMenuItem
              key={value}
              label={t(label)}
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
