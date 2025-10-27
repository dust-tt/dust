import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import { MultiPageSheet, MultiPageSheetContent, SearchInput } from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import type { ScheduleFormValues } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import {
  ScheduleEditionPage,
  type ScheduleEditionPageRef,
} from "@app/components/agent_builder/triggers/schedule/ScheduleEditionPage";
import { TriggerSelectionContent } from "@app/components/agent_builder/triggers/TriggerSelectionContent";
import type { WebhookFormValues } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import {
  WebhookEditionPage,
  type WebhookEditionPageRef,
} from "@app/components/agent_builder/triggers/webhook/WebhookEditionPage";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

const TRIGGER_SHEET_PAGE_IDS = {
  SELECTION: "selection",
  SCHEDULE_EDITION: "schedule-edition",
  WEBHOOK_EDITION: "webhook-edition",
} as const;

type TriggerSheetPageId =
  (typeof TRIGGER_SHEET_PAGE_IDS)[keyof typeof TRIGGER_SHEET_PAGE_IDS];

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
  const { user } = useUser();
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

  const [currentPageId, setCurrentPageId] = useState<TriggerSheetPageId>(
    TRIGGER_SHEET_PAGE_IDS.SELECTION
  );
  const [searchTerm, setSearchTerm] = useState("");

  const [editingTrigger, setEditingTrigger] = useState<{
    trigger: AgentBuilderTriggerType;
    index: number;
  } | null>(null);

  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(null);

  const schedulePageRef = useRef<ScheduleEditionPageRef>(null);
  const webhookPageRef = useRef<WebhookEditionPageRef>(null);

  const isOpen = mode !== null;

  // Handle mode changes from parent
  useEffect(() => {
    if (mode?.type === "edit") {
      setEditingTrigger({ trigger: mode.trigger, index: mode.index });
      if (mode.trigger.kind === "schedule") {
        setCurrentPageId(TRIGGER_SHEET_PAGE_IDS.SCHEDULE_EDITION);
      } else {
        setSelectedWebhookSourceView(mode.webhookSourceView);
        setCurrentPageId(TRIGGER_SHEET_PAGE_IDS.WEBHOOK_EDITION);
      }
      onModeChange({ type: "add" });
    }
  }, [mode, onModeChange]);

  const handleScheduleSelect = useCallback(() => {
    setEditingTrigger(null);
    setCurrentPageId(TRIGGER_SHEET_PAGE_IDS.SCHEDULE_EDITION);
  }, []);

  const handleWebhookSelect = useCallback(
    (webhookSourceView: WebhookSourceViewType) => {
      setEditingTrigger(null);
      setSelectedWebhookSourceView(webhookSourceView);
      setCurrentPageId(TRIGGER_SHEET_PAGE_IDS.WEBHOOK_EDITION);
    },
    []
  );

  const handleBackToSelection = useCallback(() => {
    setCurrentPageId(TRIGGER_SHEET_PAGE_IDS.SELECTION);
    setEditingTrigger(null);
    setSelectedWebhookSourceView(null);
  }, []);

  const handleScheduleSave = useCallback(
    async (values: ScheduleFormValues) => {
      if (!user) {
        return;
      }

      const triggerData: AgentBuilderScheduleTriggerType = {
        sId: editingTrigger?.trigger.sId,
        enabled: values.enabled,
        name: values.name.trim(),
        kind: "schedule",
        configuration: {
          cron: values.cron.trim(),
          timezone: values.timezone.trim(),
        },
        editor: editingTrigger?.trigger.editor ?? user.id ?? null,
        naturalLanguageDescription:
          values.naturalLanguageDescription?.trim() ?? null,
        customPrompt: values.customPrompt?.trim() ?? null,
        editorName:
          editingTrigger?.trigger.editorName ?? user.fullName ?? undefined,
      };

      if (editingTrigger) {
        if (editingTrigger.trigger.sId) {
          appendTriggerToUpdate(triggerData);
        } else {
          updateTriggerToCreate(editingTrigger.index, triggerData);
        }
      } else {
        appendTriggerToCreate(triggerData);
      }

      onModeChange(null);
      setCurrentPageId(TRIGGER_SHEET_PAGE_IDS.SELECTION);
      setEditingTrigger(null);
    },
    [
      user,
      editingTrigger,
      appendTriggerToUpdate,
      updateTriggerToCreate,
      appendTriggerToCreate,
      onModeChange,
    ]
  );

  const handleWebhookSave = useCallback(
    async (values: WebhookFormValues) => {
      if (!user || !selectedWebhookSourceView) {
        return;
      }

      const triggerData: AgentBuilderWebhookTriggerType = {
        sId: editingTrigger?.trigger.sId,
        enabled: values.enabled,
        name: values.name.trim(),
        kind: "webhook",
        configuration: {
          event: values.event,
          filter: values.filter?.trim() ?? undefined,
          includePayload: values.includePayload,
        },
        webhookSourceViewSId: selectedWebhookSourceView.sId,
        editor: editingTrigger?.trigger.editor ?? user.id ?? null,
        naturalLanguageDescription: null,
        customPrompt: values.customPrompt?.trim() ?? null,
        editorName:
          editingTrigger?.trigger.editorName ?? user.fullName ?? undefined,
      };

      if (editingTrigger) {
        if (editingTrigger.trigger.sId) {
          appendTriggerToUpdate(triggerData);
        } else {
          updateTriggerToCreate(editingTrigger.index, triggerData);
        }
      } else {
        appendTriggerToCreate(triggerData);
      }

      onModeChange(null);
      setCurrentPageId(TRIGGER_SHEET_PAGE_IDS.SELECTION);
      setEditingTrigger(null);
      setSelectedWebhookSourceView(null);
    },
    [
      user,
      selectedWebhookSourceView,
      editingTrigger,
      appendTriggerToUpdate,
      updateTriggerToCreate,
      appendTriggerToCreate,
      onModeChange,
    ]
  );

  const isScheduleEditor =
    (editingTrigger?.trigger?.editor ?? user?.id) === user?.id;
  const isWebhookEditor =
    (editingTrigger?.trigger?.editor ?? user?.id) === user?.id;

  const pages: MultiPageSheetPage[] = useMemo(() => {
    return [
      {
        id: TRIGGER_SHEET_PAGE_IDS.SELECTION,
        title: "Add triggers",
        description: "Select a trigger to activate your agent automatically",
        content: (
          <div className="flex flex-col gap-4 px-6 py-4">
            <SearchInput
              placeholder="Search triggers..."
              value={searchTerm}
              onChange={setSearchTerm}
              name="triggerSearch"
            />
            <TriggerSelectionContent
              onScheduleSelect={handleScheduleSelect}
              onWebhookSelect={handleWebhookSelect}
              webhookSourceViews={webhookSourceViews}
              searchTerm={searchTerm}
            />
          </div>
        ),
        footerContent: null,
      },
      {
        id: TRIGGER_SHEET_PAGE_IDS.SCHEDULE_EDITION,
        title: editingTrigger ? "Edit schedule" : "Add schedule",
        description: "",
        content: (
          <ScheduleEditionPage
            ref={schedulePageRef}
            owner={owner}
            trigger={
              editingTrigger?.trigger.kind === "schedule"
                ? editingTrigger.trigger
                : null
            }
            isEditor={isScheduleEditor}
            onSave={handleScheduleSave}
          />
        ),
        footerContent: null,
      },
      {
        id: TRIGGER_SHEET_PAGE_IDS.WEBHOOK_EDITION,
        title: editingTrigger ? "Edit webhook" : "Add webhook",
        description: "",
        content: (
          <WebhookEditionPage
            ref={webhookPageRef}
            owner={owner}
            trigger={
              editingTrigger?.trigger.kind === "webhook"
                ? editingTrigger.trigger
                : null
            }
            webhookSourceView={selectedWebhookSourceView}
            agentConfigurationId={agentConfigurationId}
            isEditor={isWebhookEditor}
            onSave={handleWebhookSave}
          />
        ),
        footerContent: null,
      },
    ];
  }, [
    searchTerm,
    handleScheduleSelect,
    handleWebhookSelect,
    webhookSourceViews,
    editingTrigger,
    isScheduleEditor,
    owner,
    handleScheduleSave,
    selectedWebhookSourceView,
    agentConfigurationId,
    isWebhookEditor,
    handleWebhookSave,
  ]);

  const getFooterButtons = useCallback(() => {
    if (currentPageId === TRIGGER_SHEET_PAGE_IDS.SELECTION) {
      return {
        leftButtonProps: {
          label: "Close",
          variant: "outline" as const,
          onClick: () => onModeChange(null),
        },
      };
    }

    if (currentPageId === TRIGGER_SHEET_PAGE_IDS.SCHEDULE_EDITION) {
      return {
        leftButtonProps: {
          label: "Back",
          variant: "outline" as const,
          onClick: handleBackToSelection,
        },
        rightButtonProps: isScheduleEditor
          ? {
              label: editingTrigger ? "Update Trigger" : "Add Trigger",
              variant: "primary" as const,
              onClick: () => void schedulePageRef.current?.submit(),
              disabled: schedulePageRef.current?.isSubmitting ?? false,
            }
          : undefined,
      };
    }

    if (currentPageId === TRIGGER_SHEET_PAGE_IDS.WEBHOOK_EDITION) {
      return {
        leftButtonProps: {
          label: "Back",
          variant: "outline" as const,
          onClick: handleBackToSelection,
        },
        rightButtonProps: isWebhookEditor
          ? {
              label: editingTrigger ? "Update Trigger" : "Add Trigger",
              variant: "primary" as const,
              onClick: () => void webhookPageRef.current?.submit(),
              disabled: webhookPageRef.current?.isSubmitting ?? false,
            }
          : undefined,
      };
    }

    return {};
  }, [
    currentPageId,
    onModeChange,
    handleBackToSelection,
    isScheduleEditor,
    editingTrigger,
    isWebhookEditor,
  ]);

  return (
    <MultiPageSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onModeChange(null);
          setCurrentPageId(TRIGGER_SHEET_PAGE_IDS.SELECTION);
          setEditingTrigger(null);
          setSelectedWebhookSourceView(null);
          setSearchTerm("");
        }
      }}
    >
      <MultiPageSheetContent
        size="lg"
        pages={pages}
        currentPageId={currentPageId}
        onPageChange={(pageId) => setCurrentPageId(pageId as TriggerSheetPageId)}
        showNavigation={false}
        showHeaderNavigation={false}
        {...getFooterButtons()}
      />
    </MultiPageSheet>
  );
}
