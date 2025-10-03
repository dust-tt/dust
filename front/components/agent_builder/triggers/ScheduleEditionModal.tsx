import {
  AnimatedText,
  ArrowRightIcon,
  ContentMessage,
  DotIcon,
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
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import type {
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useTextAsCronRule } from "@app/lib/swr/agent_triggers";
import { useUser } from "@app/lib/swr/user";
import { debounce } from "@app/lib/utils/debounce";
import type { LightWorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

const scheduleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  customPrompt: z.string(),
  cron: z.string().min(1, "Cron expression is required"),
  timezone: z.string().min(1, "Timezone is required"),
});

// a ScheduleFormData must be a TriggerFormData with a cron field
type ScheduleFormData = z.infer<typeof scheduleFormSchema>;

const MIN_DESCRIPTION_LENGTH = 10;

function formatTimezone(timezone: string): string {
  const parts = timezone.split("/");
  if (parts.length < 2) {
    return timezone;
  }
  const city = parts[parts.length - 1].replace(/_/g, " ");
  return `${city} (${timezone})`;
}

function isErrorWithMessage(
  err: unknown
): err is { error: { message: string } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "error" in err &&
    typeof err.error === "object" &&
    err.error !== null &&
    "message" in err.error &&
    typeof err.error.message === "string"
  );
}

function extractErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.error.message;
  }
  return "Unable to generate a schedule. Please try rephrasing.";
}

interface ScheduleEditionModalProps {
  owner: LightWorkspaceType;
  trigger?: AgentBuilderScheduleTriggerType;
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
  const { user } = useUser();

  const isEditor = (trigger?.editor ?? user?.id) === user?.id;

  const defaultValues: ScheduleFormData = {
    name: "Schedule",
    cron: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    customPrompt: "",
  };

  const form = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues,
    disabled: !isEditor,
  });
  const [naturalDescription, setNaturalDescription] = useState("");
  const [
    naturalDescriptionToCronRuleStatus,
    setNaturalDescriptionToCronRuleStatus,
  ] = useState<"idle" | "loading" | "error">("idle");
  const [cronErrorMessage, setCronErrorMessage] = useState<string | null>(null);
  const [generatedTimezone, setGeneratedTimezone] = useState<string | null>(
    null
  );
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const textAsCronRule = useTextAsCronRule({
    workspace: owner,
  });

  const { reset } = form;
  useEffect(() => {
    const scheduleConfig =
      trigger?.kind === "schedule" &&
      trigger?.configuration &&
      "cron" in trigger.configuration
        ? trigger.configuration
        : null;
    reset({
      name: trigger?.name ?? defaultValues.name,
      cron: scheduleConfig?.cron ?? defaultValues.cron,
      timezone: scheduleConfig?.timezone ?? defaultValues.timezone,
      customPrompt: trigger?.customPrompt ?? defaultValues.customPrompt,
    });
  }, [
    reset,
    defaultValues.name,
    defaultValues.cron,
    defaultValues.timezone,
    defaultValues.customPrompt,
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
        return cronErrorMessage;
      case "idle":
        if (!cron) {
          return undefined;
        }
        try {
          const cronDesc = cronstrue.toString(cron);
          if (generatedTimezone) {
            return `${cronDesc}, in ${formatTimezone(generatedTimezone)} timezone.`;
          }
          return cronDesc;
        } catch (error) {
          setNaturalDescriptionToCronRuleStatus("error");
        }
        break;
      default:
        assertNever(naturalDescriptionToCronRuleStatus);
    }
  }, [
    naturalDescriptionToCronRuleStatus,
    cron,
    generatedTimezone,
    cronErrorMessage,
  ]);

  const handleCancel = () => {
    onClose();
    form.reset(defaultValues);
  };

  const onSubmit = (data: ScheduleFormData) => {
    const triggerData: AgentBuilderTriggerType = {
      sId: trigger?.sId,
      name: data.name.trim(),
      kind: "schedule",
      configuration: {
        cron: data.cron.trim(),
        timezone: data.timezone.trim(),
      },
      editor: trigger?.editor ?? user?.id ?? null,
      customPrompt: data.customPrompt.trim() ?? null,
      editorEmail: trigger?.editorEmail ?? user?.email,
    };

    onSave(triggerData);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            {trigger
              ? isEditor
                ? "Edit Schedule"
                : "View Schedule"
              : "Create Schedule"}
          </SheetTitle>
        </SheetHeader>

        <SheetContainer>
          {trigger && !isEditor && (
            <ContentMessage variant="info">
              You cannot edit this schedule. It is managed by{" "}
              <span className="font-semibold">
                {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
                {trigger.editorEmail || "another user"}
              </span>
              .
            </ContentMessage>
          )}

          <FormProvider form={form} onSubmit={onSubmit}>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="trigger-name">Name</Label>
                <Input
                  id="trigger-name"
                  {...form.register("name")}
                  placeholder="Enter trigger name"
                  isError={!!form.formState.errors.name}
                  message={form.formState.errors.name?.message}
                  messageStatus="error"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="trigger-description">Scheduler</Label>
                <TextArea
                  id="schedule-description"
                  placeholder='Describe when you want the agent to run in natural language. e.g. "run every day at 9 AM", or "Late afternoon on business days"...'
                  rows={3}
                  value={naturalDescription}
                  disabled={!isEditor}
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
                            const result = await textAsCronRule(txt);
                            form.setValue("cron", result.cron);
                            form.setValue("timezone", result.timezone);
                            setGeneratedTimezone(result.timezone);
                            setNaturalDescriptionToCronRuleStatus("idle");
                          } catch (error) {
                            setNaturalDescriptionToCronRuleStatus("error");
                            setCronErrorMessage(extractErrorMessage(error));
                            setGeneratedTimezone(null);
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

                {cronDescription && (
                  <div className="my-2">
                    <ContentMessage variant="outline" size="lg">
                      <div className="flex flex-row items-start gap-2 text-foreground dark:text-foreground-night">
                        {naturalDescriptionToCronRuleStatus === "loading" ? (
                          <>
                            <DotIcon className="mt-0.5 h-4 w-4 shrink-0 self-start" />
                            <AnimatedText variant="primary">
                              {cronDescription}
                            </AnimatedText>
                          </>
                        ) : (
                          <>
                            <ArrowRightIcon className="mt-0.5 h-4 w-4 shrink-0 self-start" />
                            <p>{cronDescription}</p>
                          </>
                        )}
                      </div>
                    </ContentMessage>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="trigger-description">Message (Optional)</Label>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Add context or instructions for the agent when triggered.
                </p>
                <TextArea
                  id="schedule-custom-prompt"
                  placeholder='e.g. "Provide a summary of the latest sales figures."'
                  rows={4}
                  {...form.register("customPrompt")}
                  disabled={!isEditor}
                />
                {form.formState.errors.customPrompt && (
                  <p className="mt-1 text-xs text-red-500">
                    {form.formState.errors.customPrompt.message}
                  </p>
                )}
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

              <Input
                id="trigger-timezone"
                {...form.register("timezone")}
                placeholder="e.g., America/New_York, Europe/Paris"
                message={form.formState.errors.timezone?.message}
                messageStatus="error"
                className="hidden" // Field is hidden, but we need to keep it for form validation
              />
            </div>
          </FormProvider>
        </SheetContainer>

        <SheetFooter
          leftButtonProps={
            isEditor
              ? {
                  label: "Cancel",
                  variant: "outline",
                  onClick: handleCancel,
                }
              : undefined
          }
          rightButtonProps={{
            label: trigger
              ? isEditor
                ? "Update Trigger"
                : "Close"
              : "Add Trigger",
            variant: "primary",
            onClick: isEditor ? form.handleSubmit(onSubmit) : handleCancel,
            disabled: form.formState.isSubmitting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
