import { z } from "zod";

import type { AgentBuilderScheduleTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";

export const ScheduleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name should be less than 255 characters"),
  enabled: z.boolean().default(true),
  naturalLanguageDescription: z.string().optional(),
  customPrompt: z.string(),
  cron: z.string().min(1, "Cron expression is required"),
  timezone: z.string().min(1, "Timezone is required"),
});

export type ScheduleFormValues = z.infer<typeof ScheduleFormSchema>;

export function getScheduleFormDefaultValues(
  trigger: AgentBuilderScheduleTriggerType | null
): ScheduleFormValues {
  const scheduleConfig =
    trigger?.kind === "schedule" &&
    trigger?.configuration &&
    "cron" in trigger.configuration
      ? trigger.configuration
      : null;

  return {
    name: trigger?.name ?? "Schedule",
    enabled: trigger?.enabled ?? true,
    cron: scheduleConfig?.cron ?? "",
    timezone:
      scheduleConfig?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    naturalLanguageDescription: trigger?.naturalLanguageDescription ?? "",
    customPrompt: trigger?.customPrompt ?? "",
  };
}
