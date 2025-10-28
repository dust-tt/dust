import { zodResolver } from "@hookform/resolvers/zod";
import React, { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { WebhookFormValues } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import {
  getWebhookFormDefaultValues,
  WebhookFormSchema,
} from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import { WebhookEditionSheetContent } from "@app/components/agent_builder/triggers/webhook/WebhookEditionSheet";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

interface WebhookEditionProps {
  owner: LightWorkspaceType;
  trigger: AgentBuilderWebhookTriggerType | null;
  onSave: (trigger: AgentBuilderWebhookTriggerType) => Promise<void> | void;
  agentConfigurationId: string | null;
  webhookSourceView: WebhookSourceViewType | null;
}

export function WebhookEdition({
  owner,
  trigger,
  onSave,
  agentConfigurationId,
  webhookSourceView,
}: WebhookEditionProps) {
  const { user } = useUser();

  const isEditor = (trigger?.editor ?? user?.id) === user?.id;

  const defaultValues = useMemo(
    (): WebhookFormValues =>
      getWebhookFormDefaultValues({
        trigger,
        webhookSourceView,
      }),
    [trigger, webhookSourceView]
  );

  const form = useForm<WebhookFormValues>({
    defaultValues,
    resolver: webhookSourceView ? zodResolver(WebhookFormSchema) : undefined,
    mode: "onSubmit",
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [form, defaultValues]);

  const handleSubmit = useCallback(
    async (values: WebhookFormValues) => {
      if (!user) {
        return;
      }

      // Validate that event is selected for preset webhooks (not custom)
      if (webhookSourceView?.provider && !values.event) {
        form.setError("event", {
          type: "manual",
          message: "Please select an event",
        });
        return;
      }

      const triggerData: AgentBuilderWebhookTriggerType = {
        sId: trigger?.sId,
        enabled: values.enabled,
        name: values.name.trim(),
        customPrompt: values.customPrompt?.trim() ?? null,
        naturalLanguageDescription: webhookSourceView?.provider
          ? values.naturalDescription?.trim() ?? null
          : null,
        kind: "webhook",
        configuration: {
          includePayload: values.includePayload,
          event: values.event,
          filter: values.filter?.trim() ?? undefined,
        },
        webhookSourceViewSId: values.webhookSourceViewSId ?? undefined,
        editor: trigger?.editor ?? user.id ?? null,
        editorName: trigger?.editorName ?? user.fullName ?? undefined,
      };

      await onSave(triggerData);
    },
    [form, onSave, trigger, user, webhookSourceView]
  );

  return (
    <FormProvider form={form} onSubmit={handleSubmit}>
      <WebhookEditionSheetContent
        owner={owner}
        trigger={trigger}
        agentConfigurationId={agentConfigurationId}
        webhookSourceView={webhookSourceView}
        isEditor={isEditor}
      />
    </FormProvider>
  );
}
