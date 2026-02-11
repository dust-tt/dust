import { z } from "zod";

import type {
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { triggerStatusSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT } from "@app/types/assistant/triggers";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";

export const WebhookFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name should be less than 255 characters"),
  status: triggerStatusSchema.default("enabled"),
  customPrompt: z.string(),
  webhookSourceViewSId: z.string().min(1, "Select a webhook source"),
  event: z.string().optional(),
  filter: z.string().optional(),
  includePayload: z.boolean().default(false),
  naturalDescription: z.string().optional(),
  executionPerDayLimitOverride: z.number(),
  executionMode: z.enum(["fair_use", "programmatic"]).default("fair_use"),
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
    name:
      trigger?.name ??
      (webhookSourceView
        ? `${webhookSourceView?.webhookSource.name}` +
          (webhookSourceView?.provider
            ? ` - ${asDisplayName(webhookSourceView?.provider)}`
            : "")
        : "Webhook Trigger"),
    status: trigger?.status ?? "enabled",
    customPrompt: trigger?.customPrompt ?? "",
    webhookSourceViewSId: webhookSourceView?.sId ?? "",
    event: trigger?.configuration.event,
    filter: trigger?.configuration.filter ?? "",
    includePayload: trigger?.configuration.includePayload ?? true,
    naturalDescription: trigger?.naturalLanguageDescription ?? "",
    executionPerDayLimitOverride:
      trigger?.executionPerDayLimitOverride ??
      DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT,
    executionMode: trigger?.executionMode ?? "fair_use",
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
  user: UserType;
  webhookSourceView: WebhookSourceViewType | null;
}): AgentBuilderWebhookTriggerType {
  return {
    sId: editTrigger?.kind === "webhook" ? editTrigger.sId : undefined,
    status: webhook.status,
    name: webhook.name.trim(),
    customPrompt: webhook.customPrompt?.trim() ?? null,
    naturalLanguageDescription: webhookSourceView?.provider
      ? (webhook.naturalDescription?.trim() ?? null)
      : null,
    kind: "webhook",
    provider: webhookSourceView?.provider ?? undefined,
    configuration: {
      includePayload: webhook.includePayload,
      event: webhook.event,
      filter: webhook.filter?.trim() ?? undefined,
    },
    webhookSourceViewSId: webhook.webhookSourceViewSId ?? undefined,
    editor:
      editTrigger?.kind === "webhook" ? editTrigger.editor : (user.id ?? null),
    editorName:
      editTrigger?.kind === "webhook"
        ? editTrigger.editorName
        : (user.fullName ?? undefined),
    executionPerDayLimitOverride: webhook.executionPerDayLimitOverride,
    executionMode: webhook.executionMode,
  };
}
