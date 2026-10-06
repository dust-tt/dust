import type {
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
} from "@app/components/agent_builder/agentBuilderFormSchema";
import { triggerStatusSchema } from "@app/components/agent_builder/agentBuilderFormSchema";
import { getLocalTimeZone } from "@app/lib/i18n/format";
import type { ScheduleConfig } from "@app/types/assistant/triggers";
import {
  isCronScheduleConfig,
  isIntervalScheduleConfig,
  TRIGGER_EXECUTION_MODES,
} from "@app/types/assistant/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { UserType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";
import { z } from "zod";

export function useScheduleFormSchema() {
  const { t } = useLingui();

  return useMemo(() => {
    const commonFields = {
      name: z
        .string()
        .min(1, t`Name is required`)
        .max(255, t`Name should be less than 255 characters`),
      status: triggerStatusSchema.default("enabled"),
      naturalLanguageDescription: z.string().optional(),
      customPrompt: z.string(),
      timezone: z.string().min(1, t`Timezone is required`),
      executionMode: z.enum(TRIGGER_EXECUTION_MODES).default("user_pool"),
      spaceId: z.string().nullable(),
    };

    const cronScheduleSchema = z.object({
      ...commonFields,
      scheduleType: z.literal("cron"),
      cron: z.string().min(1, t`Cron expression is required`),
    });

    const intervalScheduleSchema = z.object({
      ...commonFields,
      scheduleType: z.literal("interval"),
      intervalDays: z.number().positive(),
      dayOfWeek: z.number().nullable(),
      hour: z.number(),
      minute: z.number(),
    });

    return z.discriminatedUnion("scheduleType", [
      cronScheduleSchema,
      intervalScheduleSchema,
    ]);
  }, [t]);
}

export type ScheduleFormValues = z.infer<
  ReturnType<typeof useScheduleFormSchema>
>;

export function useGetScheduleFormDefaultValues() {
  const { t } = useLingui();

  return useCallback(
    (trigger: AgentBuilderScheduleTriggerType | null) =>
      getScheduleFormDefaultValues({
        trigger,
        defaultName: t`Schedule`,
      }),
    [t]
  );
}

function getScheduleFormDefaultValues({
  trigger,
  defaultName,
}: {
  trigger: AgentBuilderScheduleTriggerType | null;
  defaultName: string;
}): ScheduleFormValues {
  const config = trigger?.kind === "schedule" ? trigger.configuration : null;

  const commonDefaults = {
    name: trigger?.name ?? defaultName,
    status: trigger?.status ?? "enabled",
    naturalLanguageDescription: trigger?.naturalLanguageDescription ?? "",
    customPrompt: trigger?.customPrompt ?? "",
    executionMode: trigger?.executionMode ?? "user_pool",
    spaceId: trigger?.spaceId ?? null,
  };

  if (!config) {
    return {
      ...commonDefaults,
      scheduleType: "cron" as const,
      cron: "",
      timezone: getLocalTimeZone(),
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
    executionMode: schedule.executionMode,
    editorName:
      editTrigger?.kind === "schedule"
        ? editTrigger.editorName
        : (user.fullName ?? undefined),
    spaceId: schedule.spaceId,
  };
}
