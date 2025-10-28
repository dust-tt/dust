import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { ScheduleEdition } from "@app/components/agent_builder/triggers/schedule/ScheduleEdition";
import { TriggerSelectionPageContent } from "@app/components/agent_builder/triggers/TriggerSelectionPage";
import { WebhookEdition } from "@app/components/agent_builder/triggers/webhook/WebhookEdition";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

const TRIGGERS_SHEET_PAGE_IDS = {
  SELECTION: "trigger-selection",
  SCHEDULE: "schedule-edition",
  WEBHOOK: "webhook-edition",
} as const;

const TRIGGERS_SHEET_FORM_IDS = {
  SCHEDULE: "schedule-edition-form",
  WEBHOOK: "webhook-edition-form",
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
  const [currentPageId, setCurrentPageId] = useState<PageId>(
    TRIGGERS_SHEET_PAGE_IDS.SELECTION
  );

  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(null);

  const handleSheetClose = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
    setSelectedWebhookSourceView(null);
    onModeChange(null);
  }, [onModeChange]);

  const handleScheduleSelect = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SCHEDULE);
  }, []);

  const handleWebhookSelect = useCallback(
    (webhookSourceView: WebhookSourceViewType) => {
      setSelectedWebhookSourceView(webhookSourceView);
      setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.WEBHOOK);
    },
    []
  );

  const handleScheduleSave = useCallback(
    async (trigger: AgentBuilderScheduleTriggerType) => {
      if (trigger.sId) {
        onAppendTriggerToUpdate(trigger);
      } else {
        onAppendTriggerToCreate(trigger);
      }
      handleSheetClose();
    },
    [onAppendTriggerToCreate, onAppendTriggerToUpdate, handleSheetClose]
  );

  const handleWebhookSave = useCallback(
    async (trigger: AgentBuilderWebhookTriggerType) => {
      if (trigger.sId) {
        onAppendTriggerToUpdate(trigger);
      } else {
        onAppendTriggerToCreate(trigger);
      }
      handleSheetClose();
    },
    [onAppendTriggerToCreate, onAppendTriggerToUpdate, handleSheetClose]
  );

  const handleScheduleCancel = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
  }, []);

  const handleWebhookCancel = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
    setSelectedWebhookSourceView(null);
  }, []);

  // When the mode changes to edit, navigate to the appropriate page.
  const editTrigger = mode?.type === "edit" ? mode.trigger : null;
  const editWebhookSourceView =
    mode?.type === "edit" ? mode.webhookSourceView : null;

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
        <ScheduleEdition
          owner={owner}
          trigger={editTrigger?.kind === "schedule" ? editTrigger : null}
          onSave={handleScheduleSave}
          formId={TRIGGERS_SHEET_FORM_IDS.SCHEDULE}
        />
      ),
    },
    {
      id: TRIGGERS_SHEET_PAGE_IDS.WEBHOOK,
      title: webhookTitle,
      icon: () => getAvatarFromIcon(webhookIcon),
      content: (
        <WebhookEdition
          owner={owner}
          trigger={editTrigger?.kind === "webhook" ? editTrigger : null}
          onSave={handleWebhookSave}
          agentConfigurationId={agentConfigurationId}
          webhookSourceView={editWebhookSourceView ?? selectedWebhookSourceView}
          formId={TRIGGERS_SHEET_FORM_IDS.WEBHOOK}
        />
      ),
    },
  ];

  return (
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
                onClick: () => {
                  if (currentPageId === TRIGGERS_SHEET_PAGE_IDS.SCHEDULE) {
                    handleScheduleCancel();
                  } else if (
                    currentPageId === TRIGGERS_SHEET_PAGE_IDS.WEBHOOK
                  ) {
                    handleWebhookCancel();
                  }
                },
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
                form: TRIGGERS_SHEET_FORM_IDS.SCHEDULE,
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
                  form: TRIGGERS_SHEET_FORM_IDS.WEBHOOK,
                }
              : undefined
        }
      />
    </MultiPageSheet>
  );
}
