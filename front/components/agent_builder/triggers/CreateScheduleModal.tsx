import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useCreateTrigger,
  useUpdateTrigger,
} from "@app/lib/swr/agent_triggers";
import type {
  CreateTriggerType,
  LightTriggerType,
} from "@app/types/assistant/triggers";

const scheduleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  description: z.string().max(1000, "Description is too long"),
  cron: z.string().min(1, "Cron expression is required"),
  timezone: z.string().min(1, "Timezone is required"),
});

type ScheduleFormData = z.infer<typeof scheduleFormSchema>;

interface CreateScheduleModalProps {
  trigger?: LightTriggerType;
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  agentConfigurationId: string;
}

export function CreateScheduleModal({
  trigger,
  isOpen,
  onClose,
  workspaceId,
  agentConfigurationId,
}: CreateScheduleModalProps) {
  const sendNotification = useSendNotification();

  const createTrigger = useCreateTrigger({
    workspaceId,
    agentConfigurationId,
  });

  const updateTrigger = useUpdateTrigger({
    workspaceId,
    agentConfigurationId,
    triggerId: trigger?.sId || null,
  });

  const defaultValues: ScheduleFormData = {
    name: trigger?.name || "",
    description: trigger?.description || "",
    cron:
      (trigger?.config && "cron" in trigger.config
        ? trigger.config.cron
        : "") || "",
    timezone:
      (trigger?.config && "timezone" in trigger.config
        ? trigger.config.timezone
        : "UTC") || "UTC",
  };

  const form = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues,
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
  } = form;

  // Reset form when trigger changes
  useEffect(() => {
    const newValues: ScheduleFormData = {
      name: trigger?.name || "",
      description: trigger?.description || "",
      cron:
        (trigger?.config && "cron" in trigger.config
          ? trigger.config.cron
          : "") || "",
      timezone:
        (trigger?.config && "timezone" in trigger.config
          ? trigger.config.timezone
          : "UTC") || "UTC",
    };
    reset(newValues);
  }, [trigger?.sId, trigger?.name, trigger?.description, reset]);

  const handleCancel = () => {
    onClose();
  };

  const onSubmit = async (data: ScheduleFormData) => {
    const triggerData: CreateTriggerType = {
      name: data.name.trim(),
      description: data.description.trim(),
      kind: "schedule",
      config: {
        cron: data.cron.trim(),
        timezone: data.timezone.trim(),
      },
    };

    try {
      if (trigger) {
        await updateTrigger(triggerData);
      } else {
        alert("Creating a new trigger");
        await createTrigger(triggerData);
      }
      onClose();
    } catch (error) {
      console.error("Failed to save trigger:", error);
      sendNotification({
        title: "Error",
        description: "Failed to save trigger. Please try again.",
        type: "error",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {trigger ? "Edit Schedule" : "Create Schedule"}
          </DialogTitle>
        </DialogHeader>

        {isSubmitting ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <FormProvider form={form}>
            <div className="space-y-4 py-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground dark:text-foreground-night">
                  Trigger Name
                </label>
                <Input
                  {...form.register("name")}
                  placeholder="Enter trigger name"
                  disabled={isSubmitting}
                  message={form.formState.errors.name?.message}
                  messageStatus="error"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground dark:text-foreground-night">
                  Description
                </label>
                <TextArea
                  {...form.register("description")}
                  placeholder="Enter trigger description"
                  rows={3}
                  disabled={isSubmitting}
                />
                {form.formState.errors.description && (
                  <p className="mt-1 text-xs text-red-500">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground dark:text-foreground-night">
                  Cron Expression
                </label>
                <Input
                  {...form.register("cron")}
                  placeholder="e.g., 0 9 * * 1-5 (weekdays at 9 AM)"
                  disabled={isSubmitting}
                  message={form.formState.errors.cron?.message}
                  messageStatus="error"
                />
                <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
                  Use cron format: minute hour day month weekday
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground dark:text-foreground-night">
                  Timezone
                </label>
                <Input
                  {...form.register("timezone")}
                  placeholder="e.g., America/New_York, Europe/Paris"
                  disabled={isSubmitting}
                  message={form.formState.errors.timezone?.message}
                  messageStatus="error"
                />
              </div>
            </div>
          </FormProvider>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isSubmitting}
            onClick={handleSubmit(onSubmit)}
          >
            {trigger ? "Update Trigger" : "Add Trigger"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
