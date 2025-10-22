import { z } from "zod";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

export const WebhookFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  enabled: z.boolean().default(true),
  customPrompt: z.string(),
  webhookSourceViewSId: z.string().min(1, "Select a webhook source"),
  event: z.string().optional(),
  filter: z.string().optional(),
  includePayload: z.boolean().default(false),
  naturalDescription: z.string().optional(),
});

export type WebhookFormValues = z.infer<typeof WebhookFormSchema>;

export function getWebhookFormDefaultValues({
  trigger,
  webhookSourceView,
}: {
  trigger: AgentBuilderWebhookTriggerType | null;
  webhookSourceView: WebhookSourceViewType | null;
}): WebhookFormValues {
  return {
    name: trigger?.name ?? "Webhook Trigger",
    enabled: trigger?.enabled ?? true,
    customPrompt: trigger?.customPrompt ?? "",
    webhookSourceViewSId: webhookSourceView?.sId ?? "",
    event: trigger?.configuration.event,
    filter: trigger?.configuration.filter ?? "",
    includePayload: trigger?.configuration.includePayload ?? true,
    naturalDescription: trigger?.naturalLanguageDescription ?? "",
  };
}
