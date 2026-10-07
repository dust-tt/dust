import { getScheduleFormSchema } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { getWebhookFormSchema } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import type { MessageDescriptor } from "@lingui/core";
import { z } from "zod";

export function getTriggerViewsSheetFormSchema(
  t: (descriptor: MessageDescriptor) => string
) {
  return z.discriminatedUnion("type", [
    z.object({
      type: z.literal("schedule"),
      schedule: getScheduleFormSchema(t),
    }),
    z.object({
      type: z.literal("webhook"),
      webhook: getWebhookFormSchema(t),
    }),
  ]);
}

export type TriggerViewsSheetFormValues = z.infer<
  ReturnType<typeof getTriggerViewsSheetFormSchema>
>;
