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
import {
  formValuesToScheduleTriggerData,
  getScheduleFormDefaultValues,
} from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { ScheduleEditionSheetContent } from "@app/components/agent_builder/triggers/schedule/ScheduleEditionSheet";
import { TriggerSelectionPageContent } from "@app/components/agent_builder/triggers/TriggerSelectionPage";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { TriggerViewsSheetFormSchema } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import {
  formValuesToWebhookTriggerData,
  getWebhookFormDefaultValues,
} from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
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
  webhookSourceViews: WebhookSourceViewType[];
  agentConfigurationId: string | null;
  onAppendTriggerToCreate: (trigger: AgentBuilderTriggerType) => void;
  onAppendTriggerToUpdate: (trigger: AgentBuilderTriggerType) => void;
}

export function TriggerViewsSheet({
  owner,
  mode,
  webhookSourceViews,
  agentConfigurationId,
  onAppendTriggerToCreate,
  onAppendTriggerToUpdate,
}: TriggerViewsSheetProps) {
  const { user } = useUser();

  const [open, setOpen] = useState(mode !== null);
  const [currentPageId, setCurrentPageId] = useState<string>(
    TRIGGERS_SHEET_PAGE_IDS.SELECTION
  );
  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(null);

  // When the mode changes to edit, navigate to the appropriate page.
  const editTrigger = mode?.type === "edit" ? mode.trigger : null;
  const editWebhookSourceView =
    mode?.type === "edit" ? mode.webhookSourceView : null;

  useEffect(() => {
    setOpen(mode !== null);
  }, [mode]);

  const defaultValues = useMemo((): TriggerViewsSheetFormValues => {
    switch (editTrigger?.kind) {
      case "schedule": {
        return {
          type: "schedule",
          schedule: getScheduleFormDefaultValues(editTrigger),
        };
      }
      case "webhook": {
        return {
          type: "webhook",
          webhook: getWebhookFormDefaultValues({
            trigger: editTrigger,
            webhookSourceView: editWebhookSourceView,
          }),
        };
      }
      default: {
        return {
          type: "schedule",
          schedule: getScheduleFormDefaultValues(null),
        };
      }
    }
  }, [editTrigger, editWebhookSourceView]);

  const form = useForm<TriggerViewsSheetFormValues>({
    defaultValues,
    resolver: zodResolver(TriggerViewsSheetFormSchema),
    mode: "onSubmit",
  });

  const handleSheetClose = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
    setSelectedWebhookSourceView(null);
    setOpen(false);
  }, [setOpen]);

  const handleScheduleSelect = useCallback(() => {
    form.reset({
      type: "schedule",
      schedule: getScheduleFormDefaultValues(null),
    });
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SCHEDULE);
  }, [form]);

  const handleWebhookSelect = useCallback(
    (webhookSourceView: WebhookSourceViewType) => {
      setSelectedWebhookSourceView(webhookSourceView);
      form.reset({
        type: "webhook",
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

      switch (values.type) {
        case "schedule": {
          const triggerData: AgentBuilderScheduleTriggerType =
            formValuesToScheduleTriggerData({
              schedule: values.schedule,
              editTrigger,
              user,
            });

          if (triggerData.sId) {
            onAppendTriggerToUpdate(triggerData);
          } else {
            onAppendTriggerToCreate(triggerData);
          }
          break;
        }
        case "webhook": {
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

          const triggerData: AgentBuilderWebhookTriggerType =
            formValuesToWebhookTriggerData({
              webhook: values.webhook,
              editTrigger,
              user,
              webhookSourceView,
            });

          if (triggerData.sId) {
            onAppendTriggerToUpdate(triggerData);
          } else {
            onAppendTriggerToCreate(triggerData);
          }
          break;
        }
      }

      handleSheetClose();
    },
    [
      user,
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

  // Jumping to the correct page directly in the edit.
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

  const webhookIcon = useMemo(() => {
    const webhookSourceView =
      editWebhookSourceView ?? selectedWebhookSourceView;
    return normalizeWebhookIcon(webhookSourceView?.icon);
  }, [editWebhookSourceView, selectedWebhookSourceView]);

  const isEditor = useMemo(() => {
    return editTrigger?.editor ? editTrigger?.editor === user?.id : true;
  }, [editTrigger, user]);

  const scheduleTitle = useMemo(() => {
    if (editTrigger) {
      return isEditor ? "Edit Schedule" : "View Schedule";
    }
    return "Create Schedule";
  }, [editTrigger, isEditor]);

  const webhookTitle = useMemo(() => {
    const webhookSourceView =
      editWebhookSourceView ?? selectedWebhookSourceView;

    if (editTrigger) {
      return isEditor ? "Edit Trigger" : "View Trigger";
    }
    if (webhookSourceView) {
      return `Create ${webhookSourceView.customName} Trigger`;
    }
    return "Create Trigger";
  }, [editTrigger, editWebhookSourceView, isEditor, selectedWebhookSourceView]);

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
          isEditor={isEditor}
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
          isEditor={isEditor}
        />
      ),
    },
  ];

  return (
    <FormProvider form={form} onSubmit={handleFormSubmit}>
      <MultiPageSheet
        open={open}
        onOpenChange={(open) => !open && handleSheetClose()}
      >
        <MultiPageSheetContent
          pages={pages}
          currentPageId={currentPageId}
          onPageChange={(pageId) => setCurrentPageId(pageId)}
          size="xl"
          addFooterSeparator
          showHeaderNavigation={false}
          showNavigation={false}
          leftButton={{
            label:
              currentPageId !== TRIGGERS_SHEET_PAGE_IDS.SELECTION
                ? "Cancel"
                : "Close",
            variant: "outline",
            onClick: handleCancel,
          }}
          rightButton={{
            label: "Save",
            variant: "primary",
            onClick: form.handleSubmit(handleFormSubmit),
          }}
        />
      </MultiPageSheet>
    </FormProvider>
  );
}
