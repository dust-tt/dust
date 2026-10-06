import type {
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/agentBuilderFormSchema";
import { triggerStatusSchema } from "@app/components/agent_builder/agentBuilderFormSchema";
import {
  DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT,
  TRIGGER_EXECUTION_MODES,
} from "@app/types/assistant/triggers";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";
import { z } from "zod";

export function useWebhookFormSchema() {
  const { t } = useLingui();

  return useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, t`Name is required`)
          .max(255, t`Name should be less than 255 characters`),
        status: triggerStatusSchema.default("enabled"),
        customPrompt: z.string(),
        webhookSourceViewId: z.string().min(1, t`Select a webhook source`),
        event: z.string().optional(),
        filter: z.string().optional(),
        includePayload: z.boolean().default(false),
        naturalDescription: z.string().optional(),
        executionPerDayLimitOverride: z.number(),
        executionMode: z.enum(TRIGGER_EXECUTION_MODES).default("user_pool"),
        spaceId: z.string().nullable(),
      }),
    [t]
  );
}

type WebhookFormValues = z.infer<ReturnType<typeof useWebhookFormSchema>>;

export function useGetWebhookFormDefaultValues() {
  const { t } = useLingui();

  return useCallback(
    ({
      trigger,
      webhookSourceView,
    }: {
      trigger: AgentBuilderWebhookTriggerType | null;
      webhookSourceView: WebhookSourceViewType | null;
    }) =>
      getWebhookFormDefaultValues({
        trigger,
        webhookSourceView,
        defaultName: t`Webhook trigger`,
      }),
    [t]
  );
}

function getWebhookFormDefaultValues({
  trigger,
  webhookSourceView,
  defaultName,
}: {
  trigger: AgentBuilderWebhookTriggerType | null;
  webhookSourceView: WebhookSourceViewType | null;
  defaultName: string;
}): WebhookFormValues {
  return {
    name:
      trigger?.name ??
      (webhookSourceView
        ? `${webhookSourceView?.customName}` +
          (webhookSourceView?.provider
            ? ` - ${asDisplayName(webhookSourceView?.provider)}`
            : "")
        : defaultName),
    status: trigger?.status ?? "enabled",
    customPrompt: trigger?.customPrompt ?? "",
    webhookSourceViewId: webhookSourceView?.sId ?? "",
    event: trigger?.configuration.event,
    filter: trigger?.configuration.filter ?? "",
    includePayload: trigger?.configuration.includePayload ?? true,
    naturalDescription: trigger?.naturalLanguageDescription ?? "",
    executionPerDayLimitOverride:
      trigger?.executionPerDayLimitOverride ??
      DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT,
    executionMode: trigger?.executionMode ?? "user_pool",
    spaceId: trigger?.spaceId ?? null,
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
    webhookSourceViewId: webhook.webhookSourceViewId ?? undefined,
    editor:
      editTrigger?.kind === "webhook" ? editTrigger.editor : (user.id ?? null),
    editorName:
      editTrigger?.kind === "webhook"
        ? editTrigger.editorName
        : (user.fullName ?? undefined),
    executionPerDayLimitOverride: webhook.executionPerDayLimitOverride,
    executionMode: webhook.executionMode,
    spaceId: webhook.spaceId,
  };
}
