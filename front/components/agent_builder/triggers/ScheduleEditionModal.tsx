import {
  Chip,
  ClockIcon,
  Input,
  Label,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import cronstrue from "cronstrue";
import uniqueId from "lodash/uniqueId";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import type {
  AgentBuilderTriggerType,
  ScheduleFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { scheduleFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useTextAsCronRule } from "@app/lib/swr/agent_triggers";
import { debounce } from "@app/lib/utils/debounce";
import type { LightWorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

const MIN_DESCRIPTION_LENGTH = 10;

interface ScheduleEditionModalProps {
  owner: LightWorkspaceType;
  trigger?: AgentBuilderTriggerType;
  isOpen: boolean;
  onClose: () => void;
  onSave: (trigger: AgentBuilderTriggerType) => void;
}

export function ScheduleEditionModal({
  owner,
  trigger,
  isOpen,
  onClose,
  onSave,
}: ScheduleEditionModalProps) {
  const defaultValues: ScheduleFormData = {
    name: "Schedule",
    cron: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const form = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues,
  });
  const [naturalDescription, setNaturalDescription] = useState("");
  const [
    naturalDescriptionToCronRuleStatus,
    setNaturalDescriptionToCronRuleStatus,
  ] = useState<"idle" | "loading" | "error">("idle");
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const textAsCronRule = useTextAsCronRule({
    workspace: owner,
  });

  const { reset } = form;
  useEffect(() => {
    reset({
      name: trigger?.name ?? defaultValues.name,
      cron: trigger?.configuration?.cron ?? defaultValues.cron,
      timezone: trigger?.configuration?.timezone ?? defaultValues.timezone,
    });
  }, [
    reset,
    defaultValues.name,
    defaultValues.cron,
    defaultValues.timezone,
    trigger,
  ]);

  const cron = useWatch({
    control: form.control,
    name: "cron",
  });
  const cronDescription = useMemo(() => {
    switch (naturalDescriptionToCronRuleStatus) {
      case "loading":
        return "Generating schedule...";
      case "error":
        return "Unable to generate a schedule (note: it can't be more frequent than hourly).";
      case "idle":
        if (!cron) {
          return `Please describe above... (minimum ${MIN_DESCRIPTION_LENGTH} characters)`;
        }
        try {
          return `Agent will run ${cronstrue.toString(cron)}.`;
        } catch (error) {
          setNaturalDescriptionToCronRuleStatus("error");
        }
        break;
      default:
        assertNever(naturalDescriptionToCronRuleStatus);
    }
  }, [naturalDescriptionToCronRuleStatus, cron]);

  const handleCancel = () => {
    onClose();
    form.reset(defaultValues);
  };

  const onSubmit = (data: ScheduleFormData) => {
    const triggerData: AgentBuilderTriggerType = {
      sId: trigger?.sId ?? uniqueId(),
      name: data.name.trim(),
      kind: "schedule",
      configuration: {
        cron: data.cron.trim(),
        timezone: data.timezone.trim(),
      },
    };

    onSave(triggerData);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            {trigger ? "Edit Schedule" : "Create Schedule"}
          </SheetTitle>
        </SheetHeader>

        <SheetContainer>
          <FormProvider form={form} onSubmit={onSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="trigger-name">Trigger Name</Label>
                <Input
                  id="trigger-name"
                  {...form.register("name")}
                  placeholder="Enter trigger name"
                  isError={!!form.formState.errors.name}
                  message={form.formState.errors.name?.message}
                  messageStatus="error"
                />
              </div>

              <div>
                <Label htmlFor="trigger-description">Frequency</Label>

                <TextArea
                  id="schedule-description"
                  placeholder='Describe when you want the agent to run in natural language. e.g. "run every day at 9 AM", or "Late afternoon on business days"...'
                  rows={3}
                  value={naturalDescription}
                  onChange={async (e) => {
                    const txt = e.target.value;
                    setNaturalDescription(txt);
                    setNaturalDescriptionToCronRuleStatus(
                      txt ? "loading" : "idle"
                    );
                    if (txt.length >= MIN_DESCRIPTION_LENGTH) {
                      debounce(
                        debounceHandle,
                        async () => {
                          form.setValue("cron", "");
                          try {
                            const cronRule = await textAsCronRule(txt);
                            form.setValue("cron", cronRule);
                            setNaturalDescriptionToCronRuleStatus("idle");
                          } catch (error) {
                            setNaturalDescriptionToCronRuleStatus("error");
                          }
                        },
                        500
                      );
                    } else {
                      if (debounceHandle.current) {
                        clearTimeout(debounceHandle.current);
                        debounceHandle.current = undefined;
                      }
                    }
                  }}
                />
                <div className="my-2">
                  <Chip
                    color={"primary"}
                    isBusy={naturalDescriptionToCronRuleStatus === "loading"}
                    label={cronDescription}
                    icon={ClockIcon}
                  />
                </div>
              </div>

              <Input
                id="trigger-cron"
                {...form.register("cron")}
                placeholder="e.g., 0 9 * * 1-5 (weekdays at 9 AM)"
                isError={!!form.formState.errors.cron}
                message={form.formState.errors.cron?.message}
                messageStatus="error"
                className="hidden" // Field is hidden, but we need to keep it for form validation
              />

              <div>
                <Label htmlFor="trigger-timezone">Timezone</Label>
                <Input
                  id="trigger-timezone"
                  {...form.register("timezone")}
                  placeholder="e.g., America/New_York, Europe/Paris"
                  message={form.formState.errors.timezone?.message}
                  messageStatus="error"
                />
              </div>
            </div>
          </FormProvider>
        </SheetContainer>

        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleCancel,
          }}
          rightButtonProps={{
            label: trigger ? "Update Trigger" : "Add Trigger",
            variant: "primary",
            onClick: form.handleSubmit(onSubmit),
            disabled: form.formState.isSubmitting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
