import type {
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { triggerStatusSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { ScheduleConfig } from "@app/types/assistant/triggers";
import {
  isCronScheduleConfig,
  isIntervalScheduleConfig,
} from "@app/types/assistant/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { UserType } from "@app/types/user";
import { z } from "zod";

const commonFields = {
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name should be less than 255 characters"),
  status: triggerStatusSchema.default("enabled"),
  naturalLanguageDescription: z.string().optional(),
  customPrompt: z.string(),
  timezone: z.string().min(1, "Timezone is required"),
};

const cronScheduleSchema = z.object({
  ...commonFields,
  scheduleType: z.literal("cron"),
  cron: z.string().min(1, "Cron expression is required"),
});

const intervalScheduleSchema = z.object({
  ...commonFields,
  scheduleType: z.literal("interval"),
  intervalDays: z.number().positive(),
  dayOfWeek: z.number().nullable(),
  hour: z.number(),
  minute: z.number(),
});

export const ScheduleFormSchema = z.discriminatedUnion("scheduleType", [
  cronScheduleSchema,
  intervalScheduleSchema,
]);

export type ScheduleFormValues = z.infer<typeof ScheduleFormSchema>;

export function getScheduleFormDefaultValues(
  trigger: AgentBuilderScheduleTriggerType | null
): ScheduleFormValues {
  const config = trigger?.kind === "schedule" ? trigger.configuration : null;

  const commonDefaults = {
    name: trigger?.name ?? "Schedule",
    status: trigger?.status ?? "enabled",
    naturalLanguageDescription: trigger?.naturalLanguageDescription ?? "",
    customPrompt: trigger?.customPrompt ?? "",
  };

  if (!config) {
    return {
      ...commonDefaults,
      scheduleType: "cron" as const,
      cron: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  if (isIntervalScheduleConfig(config)) {
    return {
      ...commonDefaults,
      scheduleType: "interval" as const,
      timezone: config.timezone,
      intervalDays: config.intervalDays,
      dayOfWeek: config.dayOfWeek,
      hour: config.hour,
      minute: config.minute,
    };
  }

  if (isCronScheduleConfig(config)) {
    return {
      ...commonDefaults,
      scheduleType: "cron" as const,
      cron: config.cron,
      timezone: config.timezone,
    };
  }

  assertNever(config);
}

function formValuesToScheduleConfig(
  schedule: ScheduleFormValues
): ScheduleConfig {
  if (schedule.scheduleType === "interval") {
    return {
      type: "interval",
      intervalDays: schedule.intervalDays,
      dayOfWeek: schedule.dayOfWeek,
      hour: schedule.hour,
      minute: schedule.minute,
      timezone: schedule.timezone.trim(),
    };
  }
  return {
    type: "cron",
    cron: schedule.cron.trim(),
    timezone: schedule.timezone.trim(),
  };
}

export function formValuesToScheduleTriggerData({
  schedule,
  editTrigger,
  user,
}: {
  schedule: ScheduleFormValues;
  editTrigger: AgentBuilderTriggerType | null;
  user: UserType;
}): AgentBuilderScheduleTriggerType {
  return {
    sId: editTrigger?.kind === "schedule" ? editTrigger.sId : undefined,
    status: schedule.status,
    name: schedule.name.trim(),
    kind: "schedule",
    configuration: formValuesToScheduleConfig(schedule),
    editor:
      editTrigger?.kind === "schedule" ? editTrigger.editor : (user.id ?? null),
    naturalLanguageDescription:
      schedule.naturalLanguageDescription?.trim() ?? null,
    customPrompt: schedule.customPrompt?.trim() ?? null,
    editorName:
      editTrigger?.kind === "schedule"
        ? editTrigger.editorName
        : (user.fullName ?? undefined),
  };
}
