import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type {
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getScheduleFormDefaultValues } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { ScheduleEditionSheetContent } from "@app/components/agent_builder/triggers/schedule/ScheduleEditionSheet";
import { TriggerSelectionPageContent } from "@app/components/agent_builder/triggers/TriggerSelectionPage";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { TriggerViewsSheetFormSchema } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { getWebhookFormDefaultValues } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import { WebhookEditionSheetContent } from "@app/components/agent_builder/triggers/webhook/WebhookEditionSheet";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useUser } from "@app/lib/swr/user";
import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

const TRIGGERS_SHEET_PAGE_IDS = {
  SELECTION: "trigger-selection",
  SCHEDULE: "schedule-edition",
  WEBHOOK: "webhook-edition",
} as const;

type PageId =
  (typeof TRIGGERS_SHEET_PAGE_IDS)[keyof typeof TRIGGERS_SHEET_PAGE_IDS];

export type SheetMode =
  | { type: "add" }
  | {
      type: "edit";
      trigger: AgentBuilderTriggerType;
      webhookSourceView: WebhookSourceViewType | null;
    };

interface TriggerViewsSheetProps {
  owner: LightWorkspaceType;
  mode: SheetMode | null;
  onModeChange: (mode: SheetMode | null) => void;
  webhookSourceViews: WebhookSourceViewType[];
  agentConfigurationId: string | null;
  onAppendTriggerToCreate: (trigger: AgentBuilderTriggerType) => void;
  onAppendTriggerToUpdate: (trigger: AgentBuilderTriggerType) => void;
}

export function TriggerViewsSheet({
  owner,
  mode,
  onModeChange,
  webhookSourceViews,
  agentConfigurationId,
  onAppendTriggerToCreate,
  onAppendTriggerToUpdate,
}: TriggerViewsSheetProps) {
  const { user } = useUser();

  const [currentPageId, setCurrentPageId] = useState<PageId>(
    TRIGGERS_SHEET_PAGE_IDS.SELECTION
  );

  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(null);

  // When the mode changes to edit, navigate to the appropriate page.
  const editTrigger = mode?.type === "edit" ? mode.trigger : null;
  const editWebhookSourceView =
    mode?.type === "edit" ? mode.webhookSourceView : null;

  const defaultValues = useMemo((): TriggerViewsSheetFormValues => {
    return {
      schedule:
        editTrigger?.kind === "schedule"
          ? getScheduleFormDefaultValues(editTrigger)
          : undefined,
      webhook:
        editTrigger?.kind === "webhook"
          ? getWebhookFormDefaultValues({
              trigger: editTrigger,
              webhookSourceView: editWebhookSourceView,
            })
          : selectedWebhookSourceView
            ? getWebhookFormDefaultValues({
                trigger: null,
                webhookSourceView: selectedWebhookSourceView,
              })
            : undefined,
    };
  }, [editTrigger, editWebhookSourceView, selectedWebhookSourceView]);

  const form = useForm<TriggerViewsSheetFormValues>({
    defaultValues,
    resolver: zodResolver(TriggerViewsSheetFormSchema),
    mode: "onSubmit",
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [form, defaultValues]);

  const handleSheetClose = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
    setSelectedWebhookSourceView(null);
    onModeChange(null);
  }, [onModeChange]);

  const handleScheduleSelect = useCallback(() => {
    form.reset({
      schedule: getScheduleFormDefaultValues(null),
      webhook: undefined,
    });
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SCHEDULE);
  }, [form]);

  const handleWebhookSelect = useCallback(
    (webhookSourceView: WebhookSourceViewType) => {
      setSelectedWebhookSourceView(webhookSourceView);
      form.reset({
        schedule: undefined,
        webhook: getWebhookFormDefaultValues({
          trigger: null,
          webhookSourceView,
        }),
      });
      setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.WEBHOOK);
    },
    [form]
  );

  const handleFormSubmit = useCallback(
    async (values: TriggerViewsSheetFormValues) => {
      if (!user) {
        return;
      }

      if (
        currentPageId === TRIGGERS_SHEET_PAGE_IDS.SCHEDULE &&
        values.schedule
      ) {
        const triggerData: AgentBuilderScheduleTriggerType = {
          sId: editTrigger?.kind === "schedule" ? editTrigger.sId : undefined,
          enabled: values.schedule.enabled,
          name: values.schedule.name.trim(),
          kind: "schedule",
          configuration: {
            cron: values.schedule.cron.trim(),
            timezone: values.schedule.timezone.trim(),
          },
          editor:
            editTrigger?.kind === "schedule"
              ? editTrigger.editor
              : user.id ?? null,
          naturalLanguageDescription:
            values.schedule.naturalLanguageDescription?.trim() ?? null,
          customPrompt: values.schedule.customPrompt?.trim() ?? null,
          editorName:
            editTrigger?.kind === "schedule"
              ? editTrigger.editorName
              : user.fullName ?? undefined,
        };

        if (triggerData.sId) {
          onAppendTriggerToUpdate(triggerData);
        } else {
          onAppendTriggerToCreate(triggerData);
        }
      } else if (
        currentPageId === TRIGGERS_SHEET_PAGE_IDS.WEBHOOK &&
        values.webhook
      ) {
        // Validate that event is selected for preset webhooks
        const webhookSourceView =
          editWebhookSourceView ?? selectedWebhookSourceView;
        if (webhookSourceView?.provider && !values.webhook.event) {
          form.setError("webhook.event", {
            type: "manual",
            message: "Please select an event",
          });
          return;
        }

        const triggerData: AgentBuilderWebhookTriggerType = {
          sId: editTrigger?.kind === "webhook" ? editTrigger.sId : undefined,
          enabled: values.webhook.enabled,
          name: values.webhook.name.trim(),
          customPrompt: values.webhook.customPrompt?.trim() ?? null,
          naturalLanguageDescription: webhookSourceView?.provider
            ? values.webhook.naturalDescription?.trim() ?? null
            : null,
          kind: "webhook",
          configuration: {
            includePayload: values.webhook.includePayload,
            event: values.webhook.event,
            filter: values.webhook.filter?.trim() ?? undefined,
          },
          webhookSourceViewSId:
            values.webhook.webhookSourceViewSId ?? undefined,
          editor:
            editTrigger?.kind === "webhook"
              ? editTrigger.editor
              : user.id ?? null,
          editorName:
            editTrigger?.kind === "webhook"
              ? editTrigger.editorName
              : user.fullName ?? undefined,
        };

        if (triggerData.sId) {
          onAppendTriggerToUpdate(triggerData);
        } else {
          onAppendTriggerToCreate(triggerData);
        }
      }

      handleSheetClose();
    },
    [
      user,
      currentPageId,
      editTrigger,
      editWebhookSourceView,
      selectedWebhookSourceView,
      onAppendTriggerToCreate,
      onAppendTriggerToUpdate,
      handleSheetClose,
      form,
    ]
  );

  const handleCancel = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
    setSelectedWebhookSourceView(null);
  }, []);

  useEffect(() => {
    if (mode?.type === "edit") {
      if (mode.trigger.kind === "schedule") {
        setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SCHEDULE);
      } else if (mode.trigger.kind === "webhook") {
        setSelectedWebhookSourceView(mode.webhookSourceView);
        setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.WEBHOOK);
      }
    }
  }, [mode]);

  const scheduleTitle = useMemo(() => {
    const trigger = editTrigger?.kind === "schedule" ? editTrigger : null;
    const isEditor = trigger?.editor !== undefined && trigger?.editor !== null;

    if (trigger) {
      return isEditor ? "Edit Schedule" : "View Schedule";
    }
    return "Create Schedule";
  }, [editTrigger]);

  const webhookTitle = useMemo(() => {
    const trigger = editTrigger?.kind === "webhook" ? editTrigger : null;
    const webhookSourceView =
      editWebhookSourceView ?? selectedWebhookSourceView;
    const isEditor = trigger?.editor !== undefined && trigger?.editor !== null;

    if (trigger) {
      return isEditor ? "Edit Webhook" : "View Webhook";
    }
    if (webhookSourceView) {
      return `Create ${webhookSourceView.customName} Trigger`;
    }
    return "Create Webhook";
  }, [editTrigger, editWebhookSourceView, selectedWebhookSourceView]);

  const webhookIcon = useMemo(() => {
    const webhookSourceView =
      editWebhookSourceView ?? selectedWebhookSourceView;
    return normalizeWebhookIcon(webhookSourceView?.icon);
  }, [editWebhookSourceView, selectedWebhookSourceView]);

  const scheduleIsEditor = useMemo(() => {
    const trigger = editTrigger?.kind === "schedule" ? editTrigger : null;
    return trigger?.editor !== undefined && trigger?.editor !== null;
  }, [editTrigger]);

  const webhookIsEditor = useMemo(() => {
    const trigger = editTrigger?.kind === "webhook" ? editTrigger : null;
    return trigger?.editor !== undefined && trigger?.editor !== null;
  }, [editTrigger]);

  const pages: MultiPageSheetPage[] = [
    {
      id: TRIGGERS_SHEET_PAGE_IDS.SELECTION,
      title: "Add triggers",
      content: (
        <TriggerSelectionPageContent
          onScheduleSelect={handleScheduleSelect}
          onWebhookSelect={handleWebhookSelect}
          webhookSourceViews={webhookSourceViews}
        />
      ),
    },
    {
      id: TRIGGERS_SHEET_PAGE_IDS.SCHEDULE,
      title: scheduleTitle,
      icon: () => getAvatarFromIcon("ActionTimeIcon"),
      content: (
        <ScheduleEditionSheetContent
          owner={owner}
          trigger={editTrigger?.kind === "schedule" ? editTrigger : null}
          isEditor={scheduleIsEditor}
        />
      ),
    },
    {
      id: TRIGGERS_SHEET_PAGE_IDS.WEBHOOK,
      title: webhookTitle,
      icon: () => getAvatarFromIcon(webhookIcon),
      content: (
        <WebhookEditionSheetContent
          owner={owner}
          trigger={editTrigger?.kind === "webhook" ? editTrigger : null}
          agentConfigurationId={agentConfigurationId}
          webhookSourceView={editWebhookSourceView ?? selectedWebhookSourceView}
          isEditor={webhookIsEditor}
        />
      ),
    },
  ];

  return (
    <FormProvider form={form} onSubmit={handleFormSubmit}>
      <MultiPageSheet
        open={mode !== null}
        onOpenChange={(open) => !open && handleSheetClose()}
      >
        <MultiPageSheetContent
          pages={pages}
          currentPageId={currentPageId}
          onPageChange={(pageId) => setCurrentPageId(pageId as PageId)}
          size="xl"
          addFooterSeparator
          showHeaderNavigation={false}
          showNavigation={false}
          leftButton={
            currentPageId !== TRIGGERS_SHEET_PAGE_IDS.SELECTION
              ? {
                  label: "Cancel",
                  variant: "outline",
                  onClick: handleCancel,
                }
              : {
                  label: "Close",
                  variant: "outline",
                  onClick: handleSheetClose,
                }
          }
          rightButton={
            currentPageId === TRIGGERS_SHEET_PAGE_IDS.SCHEDULE
              ? {
                  label:
                    editTrigger?.kind === "schedule"
                      ? "Update Trigger"
                      : "Add Trigger",
                  variant: "primary",
                  type: "submit",
                }
              : currentPageId === TRIGGERS_SHEET_PAGE_IDS.WEBHOOK
                ? {
                    label:
                      editTrigger?.kind === "webhook"
                        ? "Update Trigger"
                        : editWebhookSourceView ?? selectedWebhookSourceView
                          ? `Add ${(editWebhookSourceView ?? selectedWebhookSourceView)?.customName} Trigger`
                          : "Add Trigger",
                    variant: "primary",
                    type: "submit",
                  }
                : undefined
          }
        />
      </MultiPageSheet>
    </FormProvider>
  );
}
