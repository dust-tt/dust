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
import type { UserType } from "@app/types/user";
import { z } from "zod";

export const ScheduleFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(255, "Name should be less than 255 characters"),
    status: triggerStatusSchema.default("enabled"),
    naturalLanguageDescription: z.string().optional(),
    customPrompt: z.string(),
    // Cron fields (used when scheduleType is "cron").
    cron: z.string().default(""),
    timezone: z.string().min(1, "Timezone is required"),
    // Interval fields (used when scheduleType is "interval").
    scheduleType: z.enum(["cron", "interval"]).default("cron"),
    intervalDays: z.number().optional(),
    dayOfWeek: z.number().nullable().optional(),
    hour: z.number().optional(),
    minute: z.number().optional(),
  })
  .refine(
    (data) => {
      if (data.scheduleType === "cron") {
        return data.cron.length > 0;
      }
      return (
        typeof data.intervalDays === "number" &&
        data.intervalDays > 0 &&
        typeof data.hour === "number" &&
        typeof data.minute === "number"
      );
    },
    { message: "Schedule configuration is incomplete", path: ["cron"] }
  );

export type ScheduleFormValues = z.infer<typeof ScheduleFormSchema>;

export function getScheduleFormDefaultValues(
  trigger: AgentBuilderScheduleTriggerType | null
): ScheduleFormValues {
  const config = trigger?.kind === "schedule" ? trigger.configuration : null;

  if (config && isIntervalScheduleConfig(config)) {
    return {
      name: trigger?.name ?? "Schedule",
      status: trigger?.status ?? "enabled",
      scheduleType: "interval",
      cron: "",
      timezone: config.timezone,
      intervalDays: config.intervalDays,
      dayOfWeek: config.dayOfWeek,
      hour: config.hour,
      minute: config.minute,
      naturalLanguageDescription: trigger?.naturalLanguageDescription ?? "",
      customPrompt: trigger?.customPrompt ?? "",
    };
  }

  const cronConfig = config && isCronScheduleConfig(config) ? config : null;

  return {
    name: trigger?.name ?? "Schedule",
    status: trigger?.status ?? "enabled",
    scheduleType: "cron",
    cron: cronConfig?.cron ?? "",
    timezone:
      cronConfig?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    naturalLanguageDescription: trigger?.naturalLanguageDescription ?? "",
    customPrompt: trigger?.customPrompt ?? "",
  };
}

function formValuesToScheduleConfig(
  schedule: ScheduleFormValues
): ScheduleConfig {
  if (schedule.scheduleType === "interval") {
    return {
      type: "interval",
      intervalDays: schedule.intervalDays ?? 14,
      dayOfWeek: schedule.dayOfWeek ?? null,
      hour: schedule.hour ?? 9,
      minute: schedule.minute ?? 0,
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
