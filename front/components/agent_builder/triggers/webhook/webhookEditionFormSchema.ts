import { z } from "zod";

import type {
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import type { UserTypeWithWorkspaces } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

export const WebhookFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name should be less than 255 characters"),
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

export function formValuesToWebhookTriggerData({
  webhook,
  editTrigger,
  user,
  webhookSourceView,
}: {
  webhook: WebhookFormValues;
  editTrigger: AgentBuilderTriggerType | null;
  user: UserTypeWithWorkspaces;
  webhookSourceView: WebhookSourceViewType | null;
}): AgentBuilderWebhookTriggerType {
  return {
    sId: editTrigger?.kind === "webhook" ? editTrigger.sId : undefined,
    enabled: webhook.enabled,
    name: webhook.name.trim(),
    customPrompt: webhook.customPrompt?.trim() ?? null,
    naturalLanguageDescription: webhookSourceView?.provider
      ? webhook.naturalDescription?.trim() ?? null
      : null,
    kind: "webhook",
    configuration: {
      includePayload: webhook.includePayload,
      event: webhook.event,
      filter: webhook.filter?.trim() ?? undefined,
    },
    webhookSourceViewSId: webhook.webhookSourceViewSId ?? undefined,
    editor:
      editTrigger?.kind === "webhook" ? editTrigger.editor : user.id ?? null,
    editorName:
      editTrigger?.kind === "webhook"
        ? editTrigger.editorName
        : user.fullName ?? undefined,
  };
}
