import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { uniqueId } from "lodash";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { AgentBuilderTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";

const scheduleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  description: z.string().max(1000, "Description is too long"),
  cron: z
    .string()
    .min(1, "Cron expression is required")
    .regex(
      /^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([01]?\d|2[0-9]|3[01])) (\*|(1[0-2]|0?[1-9])) (\*|([0-6]))$/,
      "Invalid cron expression (expected 5 fields: min hour day month weekday)"
    ),
  timezone: z.string().min(1, "Timezone is required"),
});

type ScheduleFormData = z.infer<typeof scheduleFormSchema>;

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
    description: "",
    cron: "",
    timezone: "UTC",
  };

  const form = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues,
  });

  const { reset } = form;
  useEffect(() => {
    reset({
      name: trigger?.name ?? defaultValues.name,
      description: trigger?.description ?? defaultValues.description,
      cron: trigger?.config?.cron ?? defaultValues.cron,
      timezone: trigger?.config?.timezone ?? defaultValues.timezone,
    });
  }, [
    reset,
    defaultValues.name,
    defaultValues.description,
    defaultValues.cron,
    defaultValues.timezone,
    trigger,
  ]);

  const handleCancel = () => {
    onClose();
  };

  const onSubmit = (data: ScheduleFormData) => {
    console.log("submitting", data);
    console.log("form getValues at submit", form.getValues());

    const triggerData: AgentBuilderTriggerType = {
      sId: trigger?.sId ?? uniqueId(),
      name: data.name.trim(),
      description: data.description.trim(),
      kind: "schedule",
      config: {
        cron: data.cron.trim(),
        timezone: data.timezone.trim(),
      },
    };

    console.log("final triggerData", triggerData);
    onSave(triggerData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <FormProvider form={form} onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {trigger ? "Edit Schedule" : "Create Schedule"}
            </DialogTitle>
          </DialogHeader>

          <DialogContainer>
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
                <Label htmlFor="trigger-description">Description</Label>
                <TextArea
                  id="trigger-description"
                  {...form.register("description")}
                  placeholder="Enter trigger description"
                  rows={2}
                />
                {form.formState.errors.description && (
                  <p className="mt-1 text-xs text-red-500">
                    {form.formState.errors.description.message}
                  </p>
                )}
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
          </DialogContainer>

          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: handleCancel,
            }}
            rightButtonProps={{
              label: trigger ? "Update Trigger" : "Add Trigger",
              variant: "primary",
              onClick: form.handleSubmit(onSubmit),
              disabled: form.formState.isSubmitting || !form.formState.isValid,
            }}
          />
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
