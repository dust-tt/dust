import { useScheduleFormSchema } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { useWebhookFormSchema } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import { useMemo } from "react";
import { z } from "zod";

export function useTriggerViewsSheetFormSchema() {
  const scheduleFormSchema = useScheduleFormSchema();
  const webhookFormSchema = useWebhookFormSchema();

  return useMemo(
    () =>
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("schedule"),
          schedule: scheduleFormSchema,
        }),
        z.object({
          type: z.literal("webhook"),
          webhook: webhookFormSchema,
        }),
      ]),
    [scheduleFormSchema, webhookFormSchema]
  );
}

export type TriggerViewsSheetFormValues = z.infer<
  ReturnType<typeof useTriggerViewsSheetFormSchema>
>;
