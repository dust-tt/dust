import { z } from "zod";

import type {
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { triggerStatusSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { UserTypeWithWorkspaces } from "@app/types/user";

export const ScheduleFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name should be less than 255 characters"),
  status: triggerStatusSchema.default("enabled"),
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
    status: trigger?.status ?? "enabled",
    cron: scheduleConfig?.cron ?? "",
    timezone:
      scheduleConfig?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    naturalLanguageDescription: trigger?.naturalLanguageDescription ?? "",
    customPrompt: trigger?.customPrompt ?? "",
  };
}

export function formValuesToScheduleTriggerData({
  schedule,
  editTrigger,
  user,
}: {
  schedule: ScheduleFormValues;
  editTrigger: AgentBuilderTriggerType | null;
  user: UserTypeWithWorkspaces;
}): AgentBuilderScheduleTriggerType {
  return {
    sId: editTrigger?.kind === "schedule" ? editTrigger.sId : undefined,
    status: schedule.status,
    name: schedule.name.trim(),
    kind: "schedule",
    configuration: {
      cron: schedule.cron.trim(),
      timezone: schedule.timezone.trim(),
    },
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
