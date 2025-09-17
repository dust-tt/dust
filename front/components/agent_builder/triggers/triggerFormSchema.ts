import { z } from "zod";

const baseFields = {
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  customPrompt: z.string(),
};

const scheduleFormSchema = z.object({
  ...baseFields,
  cron: z.string().min(1, "Cron expression is required"),
  timezone: z.string().min(1, "Timezone is required"),
});

const webhookFormSchema = z.object({
  ...baseFields,
  webhookSourceViewSId: z.string().min(1, "Select a webhook source"),
  includePayload: z.boolean().default(false),
});

export const triggerFormSchema = z.union([
  scheduleFormSchema,
  webhookFormSchema,
]);

export type TriggerFormData = z.infer<typeof triggerFormSchema>;
