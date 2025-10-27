import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  PlusIcon,
  TimeIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { ScheduleEdition } from "@app/components/agent_builder/triggers/schedule/ScheduleEdition";
import { TriggerSelectionPageContent } from "@app/components/agent_builder/triggers/TriggerSelectionPage";
import { WebhookEdition } from "@app/components/agent_builder/triggers/webhook/WebhookEdition";
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
      index: number;
      webhookSourceView: WebhookSourceViewType | null;
    };

interface TriggerViewsSheetProps {
  owner: LightWorkspaceType;
  mode: SheetMode | null;
  onModeChange: (mode: SheetMode | null) => void;
  webhookSourceViews: WebhookSourceViewType[];
  agentConfigurationId: string | null;
}

export function TriggerViewsSheet({
  owner,
  mode,
  onModeChange,
  webhookSourceViews,
  agentConfigurationId,
}: TriggerViewsSheetProps) {
  const { control } = useFormContext<AgentBuilderFormData>();

  const { append: appendTriggerToCreate, update: updateTriggerToCreate } =
    useFieldArray({
      control,
      name: "triggersToCreate",
    });

  const { append: appendTriggerToUpdate } = useFieldArray({
    control,
    name: "triggersToUpdate",
  });

  const [currentPageId, setCurrentPageId] = useState<PageId>(
    TRIGGERS_SHEET_PAGE_IDS.SELECTION
  );

  const [scheduleEditionState, setScheduleEditionState] = useState<{
    trigger: AgentBuilderScheduleTriggerType | null;
    index: number | null;
  } | null>(null);

  const [webhookEditionState, setWebhookEditionState] = useState<{
    trigger: AgentBuilderWebhookTriggerType | null;
    index: number | null;
    webhookSourceView: WebhookSourceViewType | null;
  } | null>(null);

  const isSheetOpen = mode !== null;

  const handleSheetClose = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
    setScheduleEditionState(null);
    setWebhookEditionState(null);
    onModeChange(null);
  }, [onModeChange]);

  const handleScheduleSelect = useCallback(() => {
    setScheduleEditionState({ trigger: null, index: null });
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SCHEDULE);
  }, []);

  const handleWebhookSelect = useCallback(
    (webhookSourceView: WebhookSourceViewType) => {
      setWebhookEditionState({
        trigger: null,
        index: null,
        webhookSourceView,
      });
      setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.WEBHOOK);
    },
    []
  );

  const handleScheduleSave = useCallback(
    async (trigger: AgentBuilderScheduleTriggerType) => {
      if (
        scheduleEditionState &&
        scheduleEditionState.index !== null &&
        scheduleEditionState.index !== undefined
      ) {
        if (scheduleEditionState.trigger?.sId) {
          appendTriggerToUpdate(trigger);
        } else {
          updateTriggerToCreate(scheduleEditionState.index, trigger);
        }
      } else {
        appendTriggerToCreate(trigger);
      }
      handleSheetClose();
    },
    [
      scheduleEditionState,
      appendTriggerToCreate,
      appendTriggerToUpdate,
      updateTriggerToCreate,
      handleSheetClose,
    ]
  );

  const handleWebhookSave = useCallback(
    async (trigger: AgentBuilderWebhookTriggerType) => {
      if (
        webhookEditionState &&
        webhookEditionState.index !== null &&
        webhookEditionState.index !== undefined
      ) {
        if (webhookEditionState.trigger?.sId) {
          appendTriggerToUpdate(trigger);
        } else {
          updateTriggerToCreate(webhookEditionState.index, trigger);
        }
      } else {
        appendTriggerToCreate(trigger);
      }
      handleSheetClose();
    },
    [
      webhookEditionState,
      appendTriggerToCreate,
      appendTriggerToUpdate,
      updateTriggerToCreate,
      handleSheetClose,
    ]
  );

  const handleScheduleCancel = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
    setScheduleEditionState(null);
  }, []);

  const handleWebhookCancel = useCallback(() => {
    setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SELECTION);
    setWebhookEditionState(null);
  }, []);

  if (mode?.type === "edit") {
    if (mode.trigger.kind === "schedule") {
      if (scheduleEditionState === null) {
        setScheduleEditionState({
          trigger: mode.trigger,
          index: mode.index,
        });
        setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.SCHEDULE);
        onModeChange(null);
      }
    } else if (mode.trigger.kind === "webhook") {
      if (webhookEditionState === null) {
        setWebhookEditionState({
          trigger: mode.trigger,
          index: mode.index,
          webhookSourceView: mode.webhookSourceView,
        });
        setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.WEBHOOK);
        onModeChange(null);
      }
    }
  }

  const scheduleTitle = useMemo(() => {
    const trigger = scheduleEditionState?.trigger;
    const isEditor =
      scheduleEditionState?.trigger?.editor !== undefined &&
      scheduleEditionState?.trigger?.editor !== null;

    if (trigger) {
      return isEditor ? "Edit Schedule" : "View Schedule";
    }
    return "Create Schedule";
  }, [scheduleEditionState]);

  const webhookTitle = useMemo(() => {
    const trigger = webhookEditionState?.trigger;
    const webhookSourceView = webhookEditionState?.webhookSourceView;
    const isEditor =
      webhookEditionState?.trigger?.editor !== undefined &&
      webhookEditionState?.trigger?.editor !== null;

    if (trigger) {
      return isEditor ? "Edit Webhook" : "View Webhook";
    }
    if (webhookSourceView) {
      return `Create ${webhookSourceView.customName} Trigger`;
    }
    return "Create Webhook";
  }, [webhookEditionState]);

  const webhookIcon = useMemo(() => {
    const webhookSourceView = webhookEditionState?.webhookSourceView;
    if (!webhookSourceView || !webhookSourceView.provider) {
      return PlusIcon;
    }
    return PlusIcon;
  }, [webhookEditionState]);

  const pages: MultiPageSheetPage[] = [
    {
      id: TRIGGERS_SHEET_PAGE_IDS.SELECTION,
      title: "Add triggers",
      icon: PlusIcon,
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
      icon: TimeIcon,
      content: (
        <ScheduleEdition
          owner={owner}
          trigger={scheduleEditionState?.trigger ?? null}
          onSave={handleScheduleSave}
        />
      ),
    },
    {
      id: TRIGGERS_SHEET_PAGE_IDS.WEBHOOK,
      title: webhookTitle,
      icon: webhookIcon,
      content: (
        <WebhookEdition
          owner={owner}
          trigger={webhookEditionState?.trigger ?? null}
          onSave={handleWebhookSave}
          agentConfigurationId={agentConfigurationId}
          webhookSourceView={webhookEditionState?.webhookSourceView ?? null}
        />
      ),
    },
  ];

  return (
    <MultiPageSheet
      open={isSheetOpen}
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
      />
    </MultiPageSheet>
  );
}
