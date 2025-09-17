import {
  ContentMessage,
  Input,
  Label,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import uniqueId from "lodash/uniqueId";
import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type { AgentBuilderTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ScheduleTriggerSubForm } from "@app/components/agent_builder/triggers/ScheduleTriggerSubForm";
import type { TriggerFormData } from "@app/components/agent_builder/triggers/triggerFormSchema";
import { triggerFormSchema } from "@app/components/agent_builder/triggers/triggerFormSchema";
import { WebhookTriggerSubForm } from "@app/components/agent_builder/triggers/WebhookTriggerSubForm";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useUser } from "@app/lib/swr/user";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type { TriggerKind } from "@app/types/assistant/triggers";

interface TriggerEditionModalProps {
  owner: LightWorkspaceType;
  trigger?: AgentBuilderTriggerType;
  triggerKind?: TriggerKind;
  isOpen: boolean;
  onClose: () => void;
  onSave: (trigger: AgentBuilderTriggerType) => void;
}

function getDefaultFormValues(kind: TriggerKind = "schedule"): TriggerFormData {
  switch (kind) {
    case "schedule":
      return {
        name: "Trigger",
        customPrompt: "",
        cron: "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        kind: "schedule",
      };
    case "webhook":
      return {
        name: "Trigger",
        customPrompt: "",
        webhookSourceViewSId: "",
        includePayload: false,
        kind: "webhook",
      };
  }
}

function SubFormComponent({
  kind,
  owner,
  isEditor,
  scheduleResetKey,
}: {
  kind: TriggerKind;
  owner: LightWorkspaceType;
  isEditor: boolean;
  scheduleResetKey: string;
}) {
  switch (kind) {
    case "schedule":
      return (
        <ScheduleTriggerSubForm
          owner={owner}
          isEditor={isEditor}
          resetKey={scheduleResetKey}
        />
      );
    case "webhook":
      return <WebhookTriggerSubForm owner={owner} isEditor={isEditor} />;
    default:
      return null;
  }
}

export function TriggerEditionModal({
  owner,
  trigger,
  triggerKind,
  isOpen,
  onClose,
  onSave,
}: TriggerEditionModalProps) {
  const { user } = useUser();
  const { webhookSourcesWithViews } = useWebhookSourcesWithViews({ owner });
  const [selectedKind, setSelectedKind] = useState<TriggerKind>("schedule");

  const hasWebhookSources = webhookSourcesWithViews.length > 0;

  const defaultValues = useMemo(
    () => getDefaultFormValues(selectedKind),
    [selectedKind]
  );

  const form = useForm<TriggerFormData>({
    resolver: zodResolver(triggerFormSchema),
    defaultValues,
  });

  const isEditor = !trigger?.editor || trigger?.editor === user?.id;
  const scheduleResetKey = useMemo(
    () =>
      `${trigger?.sId ?? "new"}-${selectedKind}-${isOpen ? "open" : "closed"}-${hasWebhookSources}`,
    [trigger?.sId, selectedKind, isOpen, hasWebhookSources]
  );

  useEffect(() => {
    if (!isOpen) {
      form.reset(defaultValues);
      setSelectedKind(selectedKind);
      return;
    }

    if (!trigger) {
      const kind = triggerKind ?? selectedKind;
      const newDefaultValues = getDefaultFormValues(kind);
      form.reset(newDefaultValues);
      setSelectedKind(kind);
      return;
    }

    if (trigger.kind === "schedule" && trigger.configuration) {
      const scheduleDefaultValues = getDefaultFormValues("schedule");
      if (scheduleDefaultValues.kind === "schedule") {
        form.reset({
          ...scheduleDefaultValues,
          name: trigger.name,
          customPrompt: trigger.customPrompt ?? "",
          kind: "schedule",
          cron: trigger.configuration.cron ?? "",
          timezone:
            trigger.configuration.timezone ?? scheduleDefaultValues.timezone,
        });
      }
      setSelectedKind("schedule");
    } else if (trigger.kind === "webhook") {
      const webhookDefaultValues = getDefaultFormValues("webhook");
      if (webhookDefaultValues.kind === "webhook") {
        const includePayload =
          trigger.configuration &&
          "includePayload" in trigger.configuration &&
          typeof trigger.configuration.includePayload === "boolean"
            ? trigger.configuration.includePayload
            : false;

        form.reset({
          ...webhookDefaultValues,
          name: trigger.name,
          customPrompt: trigger.customPrompt ?? "",
          kind: "webhook",
          webhookSourceViewSId: trigger.webhookSourceViewSId ?? "",
          includePayload,
        });
      }
      setSelectedKind("webhook");
    }
  }, [defaultValues, form, isOpen, trigger, triggerKind, selectedKind]);

  const handleCancel = () => {
    form.reset(defaultValues);
    setSelectedKind(defaultValues.kind);
    onClose();
  };

  const onSubmit = (data: TriggerFormData) => {
    if (!user) {
      return;
    }

    const editor = trigger?.editor ?? user.id ?? null;
    const editorEmail = trigger?.editorEmail ?? user.email ?? undefined;

    const baseTrigger = {
      sId: trigger?.sId ?? uniqueId(),
      name: data.name.trim(),
      customPrompt: data.customPrompt.trim(),
      editor,
      editorEmail,
    } as const;

    let triggerData: AgentBuilderTriggerType;

    if (data.kind === "schedule") {
      triggerData = {
        ...baseTrigger,
        kind: "schedule",
        configuration: {
          cron: data.cron.trim(),
          timezone: data.timezone.trim(),
        },
      };
    } else {
      triggerData = {
        ...baseTrigger,
        kind: "webhook",
        configuration: {
          includePayload: data.includePayload,
        },
        webhookSourceViewSId: data.webhookSourceViewSId ?? undefined,
      };
    }

    onSave(triggerData);
    handleCancel();
  };

  useEffect(() => {
    if (isEditor) {
      form.setValue("kind", selectedKind);
      if (selectedKind === "schedule") {
        form.setValue("webhookSourceViewSId", "");
        form.setValue("includePayload", false);
      }
    }
  }, [form, isEditor, selectedKind]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            {trigger
              ? isEditor
                ? `Edit ${trigger.kind === "schedule" ? "Schedule" : "Webhook"}`
                : `View ${trigger.kind === "schedule" ? "Schedule" : "Webhook"}`
              : `Create ${selectedKind === "schedule" ? "Schedule" : "Webhook"}`}
          </SheetTitle>
        </SheetHeader>

        <SheetContainer>
          {trigger && !isEditor && (
            <ContentMessage variant="info">
              You cannot edit this trigger. It is managed by{" "}
              <span className="font-semibold">
                {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
                {trigger.editorEmail || "another user"}
              </span>
              .
            </ContentMessage>
          )}

          <FormProvider form={form} onSubmit={onSubmit}>
            <div className="space-y-5">
              <div className="space-y-1">
                <Label htmlFor="trigger-name">Name</Label>
                <Input
                  id="trigger-name"
                  placeholder="Enter trigger name"
                  disabled={!isEditor}
                  {...form.register("name")}
                  isError={!!form.formState.errors.name}
                  message={form.formState.errors.name?.message}
                  messageStatus="error"
                />
              </div>

              <SubFormComponent
                kind={selectedKind}
                owner={owner}
                isEditor={isEditor}
                scheduleResetKey={scheduleResetKey}
              />

              <div className="space-y-1">
                <Label htmlFor="trigger-prompt">Message (Optional)</Label>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Add context or instructions for the agent when the trigger
                  runs.
                </p>
                <TextArea
                  id="trigger-prompt"
                  rows={4}
                  disabled={!isEditor}
                  {...form.register("customPrompt")}
                />
              </div>
            </div>
          </FormProvider>
        </SheetContainer>

        <SheetFooter
          leftButtonProps={
            isEditor
              ? {
                  label: "Cancel",
                  variant: "outline",
                  onClick: handleCancel,
                }
              : undefined
          }
          rightButtonProps={{
            label: trigger
              ? isEditor
                ? `Update ${trigger.kind === "schedule" ? "Schedule" : "Webhook"}`
                : "Close"
              : `Add ${selectedKind === "schedule" ? "Schedule" : "Webhook"}`,
            variant: "primary",
            onClick: isEditor ? form.handleSubmit(onSubmit) : handleCancel,
            disabled: form.formState.isSubmitting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
