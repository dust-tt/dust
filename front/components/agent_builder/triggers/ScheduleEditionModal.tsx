import {
  Input,
  Label,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import uniqueId from "lodash/uniqueId";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";

import type {
  AgentBuilderTriggerType,
  ScheduleFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { scheduleFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";

interface ScheduleEditionModalProps {
  trigger?: AgentBuilderTriggerType;
  isOpen: boolean;
  onClose: () => void;
  onSave: (trigger: AgentBuilderTriggerType) => void;
}

export function ScheduleEditionModal({
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
                <Label htmlFor="trigger-cron">Cron Expression</Label>
                <Input
                  id="trigger-cron"
                  {...form.register("cron")}
                  placeholder="e.g., 0 9 * * 1-5 (weekdays at 9 AM)"
                  isError={!!form.formState.errors.cron}
                  message={form.formState.errors.cron?.message}
                  messageStatus="error"
                />
                <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
                  Use cron format: minute hour day month weekday
                </p>
              </div>

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
