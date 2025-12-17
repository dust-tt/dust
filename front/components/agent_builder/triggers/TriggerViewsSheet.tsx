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

  const [currentPageId, setCurrentPageId] = useState<string>(
    TRIGGERS_SHEET_PAGE_IDS.SELECTION
  );
  const [open, setOpen] = useState(mode !== null);

  const editTrigger = mode?.type === "edit" ? mode.trigger : null;
  const editWebhookSourceView =
    mode?.type === "edit" ? mode.webhookSourceView : null;

  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(editWebhookSourceView);

  const webhookSourceView = editWebhookSourceView ?? selectedWebhookSourceView;

  const isEditor = editTrigger?.editor
    ? editTrigger?.editor === user?.id
    : true;

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
    setSelectedWebhookSourceView(null);
    setOpen(false);
  }, []);

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
      handleSheetClose,
      editTrigger,
      webhookSourceView,
      onAppendTriggerToCreate,
      onAppendTriggerToUpdate,
      form,
    ]
  );

  const handleCancel = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
    setSelectedWebhookSourceView(null);
  }, []);

  // Jumping to the correct page directly in the edit.
  useEffect(() => {
    form.reset(defaultValues);
    if (mode?.type === "edit") {
      switch (mode.trigger.kind) {
        case "schedule": {
          return setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SCHEDULE);
        }
        case "webhook": {
          setSelectedWebhookSourceView(mode.webhookSourceView);
          return setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.WEBHOOK);
        }
      }
    }
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
  }, [defaultValues, form, mode]);

  useEffect(() => {
    if (mode) {
      setOpen(true);
    }
  }, [mode]);

  let scheduleTitle;
  if (editTrigger) {
    scheduleTitle = isEditor ? "Edit Schedule" : "View Schedule";
  } else {
    scheduleTitle = "Create Schedule";
  }

  let webhookTitle;
  if (editTrigger) {
    webhookTitle = isEditor ? "Edit Trigger" : "View Trigger";
  } else if (webhookSourceView) {
    webhookTitle = `Create ${webhookSourceView.customName} Trigger`;
  } else {
    webhookTitle = "Create Trigger";
  }

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
      icon: () =>
        getAvatarFromIcon(normalizeWebhookIcon(webhookSourceView?.icon)),
      content: (
        <WebhookEditionSheetContent
          owner={owner}
          trigger={editTrigger?.kind === "webhook" ? editTrigger : null}
          agentConfigurationId={agentConfigurationId}
          webhookSourceView={webhookSourceView}
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
