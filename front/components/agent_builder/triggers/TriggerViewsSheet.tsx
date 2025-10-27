import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  ContentMessage,
  Input,
  Label,
  MultiPageSheet,
  MultiPageSheetContent,
  SearchInput,
  SliderToggle,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { RecentWebhookRequests } from "@app/components/agent_builder/triggers/RecentWebhookRequests";
import type { ScheduleFormValues } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import {
  getScheduleFormDefaultValues,
  ScheduleFormSchema,
} from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { ScheduleEditionScheduler } from "@app/components/agent_builder/triggers/schedule/ScheduleEditionScheduler";
import { TriggerSelectionContent } from "@app/components/agent_builder/triggers/TriggerSelectionContent";
import { WebhookEditionFilters } from "@app/components/agent_builder/triggers/webhook/WebhookEditionFilters";
import type { WebhookFormValues } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import {
  getWebhookFormDefaultValues,
  WebhookFormSchema,
} from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import {
  WebhookEditionEventSelector,
  WebhookEditionIncludePayload,
  WebhookEditionMessageInput,
} from "@app/components/agent_builder/triggers/webhook/WebhookEditionSheet";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";
import type { PresetWebhook } from "@app/types/triggers/webhooks_source_preset";

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

  const selectedPreset = useMemo((): PresetWebhook | null => {
    if (
      !selectedWebhookSourceView ||
      selectedWebhookSourceView.provider === null
    ) {
      return null;
    }
    return WEBHOOK_PRESETS[selectedWebhookSourceView.provider];
  }, [selectedWebhookSourceView]);

  const availableEvents = useMemo(() => {
    if (!selectedPreset || !selectedWebhookSourceView) {
      return [];
    }

    return selectedPreset.events.filter((event) =>
      selectedWebhookSourceView.subscribedEvents.includes(event.value)
    );
  }, [selectedPreset, selectedWebhookSourceView]);

  const isOpen = mode !== null;

  const scheduleDefaultValues = useMemo((): ScheduleFormValues => {
    if (editingTrigger?.trigger.kind === "schedule") {
      return getScheduleFormDefaultValues(editingTrigger.trigger);
    }
    return getScheduleFormDefaultValues(null);
  }, [editingTrigger]);

  const scheduleForm = useForm<ScheduleFormValues>({
    defaultValues: scheduleDefaultValues,
    resolver: zodResolver(ScheduleFormSchema),
    mode: "onSubmit",
  });

  useEffect(() => {
    scheduleForm.reset(scheduleDefaultValues);
  }, [scheduleForm, scheduleDefaultValues]);

  const webhookDefaultValues = useMemo((): WebhookFormValues => {
    if (editingTrigger?.trigger.kind === "webhook") {
      return getWebhookFormDefaultValues({
        trigger: editingTrigger.trigger,
        webhookSourceView: selectedWebhookSourceView,
      });
    }
    return getWebhookFormDefaultValues({
      trigger: null,
      webhookSourceView: selectedWebhookSourceView,
    });
  }, [editingTrigger, selectedWebhookSourceView]);

  const webhookForm = useForm<WebhookFormValues>({
    defaultValues: webhookDefaultValues,
    resolver: selectedWebhookSourceView
      ? zodResolver(WebhookFormSchema)
      : undefined,
    mode: "onSubmit",
  });

  useEffect(() => {
    webhookForm.reset(webhookDefaultValues);
  }, [webhookForm, webhookDefaultValues]);

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
    },
    [
      user,
      editingTrigger,
      appendTriggerToCreate,
      appendTriggerToUpdate,
      updateTriggerToCreate,
      onModeChange,
    ]
  );

  const handleWebhookSave = useCallback(
    async (values: WebhookFormValues) => {
      if (!user) {
        return;
      }

      if (selectedWebhookSourceView?.provider && !values.event) {
        webhookForm.setError("event", {
          type: "manual",
          message: "Please select an event",
        });
        return;
      }

      const triggerData: AgentBuilderWebhookTriggerType = {
        sId: editingTrigger?.trigger.sId,
        enabled: values.enabled,
        name: values.name.trim(),
        customPrompt: values.customPrompt?.trim() ?? null,
        naturalLanguageDescription: selectedWebhookSourceView?.provider
          ? values.naturalDescription?.trim() ?? null
          : null,
        kind: "webhook",
        configuration: {
          includePayload: values.includePayload,
          event: values.event,
          filter: values.filter?.trim() ?? undefined,
        },
        webhookSourceViewSId: values.webhookSourceViewSId ?? undefined,
        editor: editingTrigger?.trigger.editor ?? user.id ?? null,
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
    },
    [
      user,
      selectedWebhookSourceView,
      editingTrigger,
      appendTriggerToCreate,
      appendTriggerToUpdate,
      updateTriggerToCreate,
      webhookForm,
      onModeChange,
    ]
  );

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
          <>
            <SearchInput
              placeholder="Search triggers..."
              value={searchTerm}
              onChange={setSearchTerm}
              name="triggerSearch"
              className="mt-4"
            />
            <TriggerSelectionContent
              onScheduleSelect={handleScheduleSelect}
              onWebhookSelect={handleWebhookSelect}
              webhookSourceViews={webhookSourceViews}
              searchTerm={searchTerm}
            />
          </>
        ),
        footerContent: null,
      },
      {
        id: TRIGGER_SHEET_PAGE_IDS.SCHEDULE_EDITION,
        title: editingTrigger ? "Edit schedule" : "Add schedule",
        description: "",
        content: (
          <FormProvider form={scheduleForm} onSubmit={handleScheduleSave}>
            <div className="space-y-4 pt-3">
              {editingTrigger?.trigger && !isScheduleEditor && (
                <ContentMessage variant="info">
                  You cannot edit this schedule. It is managed by{" "}
                  <span className="font-semibold">
                    {editingTrigger.trigger.editorName ?? "another user"}
                  </span>
                  .
                </ContentMessage>
              )}
              <div className="space-y-1">
                <Label htmlFor="trigger-name">Name</Label>
                <Input
                  id="trigger-name"
                  placeholder="Enter trigger name"
                  disabled={!isScheduleEditor}
                  {...scheduleForm.register("name")}
                  isError={!!scheduleForm.formState.errors.name}
                  message={scheduleForm.formState.errors.name?.message}
                  messageStatus="error"
                />
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  When disabled, the trigger will not run.
                </p>
                <div className="flex flex-row items-center gap-2">
                  <SliderToggle
                    size="xs"
                    disabled={!isScheduleEditor}
                    selected={scheduleForm.watch("enabled")}
                    onClick={() =>
                      scheduleForm.setValue(
                        "enabled",
                        !scheduleForm.watch("enabled")
                      )
                    }
                  />
                  {scheduleForm.watch("enabled")
                    ? "The trigger is currently enabled"
                    : "The trigger is currently disabled"}
                </div>
              </div>

              <ScheduleEditionScheduler
                isEditor={isScheduleEditor}
                owner={owner}
              />

              <div className="space-y-1">
                <Label htmlFor="schedule-custom-prompt">
                  Message (Optional)
                </Label>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Add context or instructions for the agent when triggered.
                </p>
                <TextArea
                  id="schedule-custom-prompt"
                  placeholder='e.g. "Provide a summary of the latest sales figures."'
                  rows={4}
                  disabled={!isScheduleEditor}
                  {...scheduleForm.register("customPrompt")}
                />
              </div>
            </div>
          </FormProvider>
        ),
        footerContent: null,
      },
      {
        id: TRIGGER_SHEET_PAGE_IDS.WEBHOOK_EDITION,
        title: editingTrigger ? "Edit webhook" : "Add webhook",
        description: "",
        content: (
          <FormProvider form={webhookForm} onSubmit={handleWebhookSave}>
            <div className="space-y-4 pt-3">
              {editingTrigger?.trigger && !isWebhookEditor && (
                <ContentMessage variant="info">
                  You cannot edit this webhook. It is managed by{" "}
                  <span className="font-semibold">
                    {editingTrigger.trigger.editorName ?? "another user"}
                  </span>
                  .
                </ContentMessage>
              )}
              <div className="space-y-1">
                <Label htmlFor="webhook-trigger-name">Name</Label>
                <Input
                  id="webhook-trigger-name"
                  placeholder="Enter trigger name"
                  disabled={!isWebhookEditor}
                  {...webhookForm.register("name")}
                  isError={!!webhookForm.formState.errors.name}
                  message={webhookForm.formState.errors.name?.message}
                  messageStatus="error"
                />
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  When disabled, the trigger will not run.
                </p>
                <div className="flex flex-row items-center gap-2">
                  <SliderToggle
                    size="xs"
                    disabled={!isWebhookEditor}
                    selected={webhookForm.watch("enabled")}
                    onClick={() =>
                      webhookForm.setValue(
                        "enabled",
                        !webhookForm.watch("enabled")
                      )
                    }
                  />
                  {webhookForm.watch("enabled")
                    ? "The trigger is currently enabled"
                    : "The trigger is currently disabled"}
                </div>
              </div>

              {selectedWebhookSourceView && (
                <>
                  <WebhookEditionEventSelector
                    isEditor={isWebhookEditor}
                    selectedPreset={selectedPreset}
                    availableEvents={availableEvents}
                  />
                  <WebhookEditionFilters
                    isEditor={isWebhookEditor}
                    webhookSourceView={selectedWebhookSourceView}
                    selectedPreset={selectedPreset}
                    availableEvents={availableEvents}
                    workspace={owner}
                  />
                  <WebhookEditionIncludePayload isEditor={isWebhookEditor} />
                </>
              )}
              <WebhookEditionMessageInput isEditor={isWebhookEditor} />

              {agentConfigurationId &&
                editingTrigger?.trigger.kind === "webhook" &&
                editingTrigger.trigger.sId && (
                  <RecentWebhookRequests
                    owner={owner}
                    agentConfigurationId={agentConfigurationId}
                    trigger={editingTrigger.trigger}
                  />
                )}
            </div>
          </FormProvider>
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
    scheduleForm,
    handleScheduleSave,
    isScheduleEditor,
    owner,
    webhookForm,
    handleWebhookSave,
    isWebhookEditor,
    selectedWebhookSourceView,
    selectedPreset,
    availableEvents,
    agentConfigurationId,
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
              onClick: () =>
                void scheduleForm.handleSubmit(handleScheduleSave)(),
              disabled: scheduleForm.formState.isSubmitting,
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
              onClick: () => void webhookForm.handleSubmit(handleWebhookSave)(),
              disabled: webhookForm.formState.isSubmitting,
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
    isWebhookEditor,
    editingTrigger,
    scheduleForm,
    webhookForm,
    handleScheduleSave,
    handleWebhookSave,
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
        onPageChange={(pageId) =>
          setCurrentPageId(pageId as TriggerSheetPageId)
        }
        showNavigation={false}
        showHeaderNavigation={false}
        {...getFooterButtons()}
      />
    </MultiPageSheet>
  );
}
