import { z } from "zod";

import { ScheduleFormSchema } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { WebhookFormSchema } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";

export const TriggerViewsSheetFormSchema = z.object({
  schedule: ScheduleFormSchema.optional(),
  webhook: WebhookFormSchema.optional(),
});

export type TriggerViewsSheetFormValues = z.infer<
  typeof TriggerViewsSheetFormSchema
>;
