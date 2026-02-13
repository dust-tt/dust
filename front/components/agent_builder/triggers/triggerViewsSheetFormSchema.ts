import { ScheduleFormSchema } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { WebhookFormSchema } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import { z } from "zod";

export const TriggerViewsSheetFormSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("schedule"),
    schedule: ScheduleFormSchema,
  }),
  z.object({
    type: z.literal("webhook"),
    webhook: WebhookFormSchema,
  }),
]);

export type TriggerViewsSheetFormValues = z.infer<
  typeof TriggerViewsSheetFormSchema
>;
