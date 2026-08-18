import type {
  AgentBuilderGmailMonitorTriggerType,
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { GmailMonitorEditionSheetContent } from "@app/components/agent_builder/triggers/monitor/GmailMonitorEditionSheet";
import { MCPToolMonitorEditionSheetContent } from "@app/components/agent_builder/triggers/monitor/MCPToolMonitorEditionSheet";
import { ScheduleEditionSheetContent } from "@app/components/agent_builder/triggers/schedule/ScheduleEditionSheet";
import {
  formValuesToScheduleTriggerData,
  getScheduleFormDefaultValues,
} from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { TriggerSelectionPageContent } from "@app/components/agent_builder/triggers/TriggerSelectionPage";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { TriggerViewsSheetFormSchema } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { WebhookEditionSheetContent } from "@app/components/agent_builder/triggers/webhook/WebhookEditionSheet";
import {
  formValuesToWebhookTriggerData,
  getWebhookFormDefaultValues,
} from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useMonitorableMCPServerViews } from "@app/lib/swr/mcp_servers";
import { getMonitorableMCPTools } from "@app/lib/triggers/monitorable_mcp_servers";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

const TRIGGERS_SHEET_PAGE_IDS = {
  SELECTION: "trigger-selection",
  SCHEDULE: "schedule-edition",
  MONITOR: "gmail-monitor-edition",
  MCP_MONITOR: "mcp-monitor-edition",
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
  const { user } = useAuth();
  const { serverViews: mcpServerViews } = useMonitorableMCPServerViews({
    owner,
  });

  const [currentPageId, setCurrentPageId] = useState<string>(
    TRIGGERS_SHEET_PAGE_IDS.SELECTION
  );
  const [open, setOpen] = useState(mode !== null);

  const editTrigger = mode?.type === "edit" ? mode.trigger : null;
  const editWebhookSourceView =
    mode?.type === "edit" ? mode.webhookSourceView : null;

  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(editWebhookSourceView);
  const [selectedMCPServerView, setSelectedMCPServerView] =
    useState<MCPServerViewType | null>(null);

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
      case "monitor":
        return {
          type: "monitor",
          monitor: {
            ...editTrigger.configuration,
            sId: editTrigger.sId,
            status: editTrigger.status === "enabled" ? "enabled" : "disabled",
            name: editTrigger.name,
            customPrompt: editTrigger.customPrompt,
            naturalLanguageDescription: editTrigger.naturalLanguageDescription,
            editor: editTrigger.editor,
            spaceId: editTrigger.spaceId,
          },
        } as TriggerViewsSheetFormValues;
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

  const handleMCPMonitorSelect = useCallback(
    (mcpServerView: MCPServerViewType) => {
      const tools = getMonitorableMCPTools(mcpServerView);
      setSelectedMCPServerView(mcpServerView);
      form.reset({
        type: "mcp-monitor",
        mcpMonitor: {
          name: `Monitor ${getMcpServerViewDisplayName(mcpServerView)}`,
          mcpServerViewId: mcpServerView.sId,
          toolName: tools[0]?.name ?? "",
          inputJson: "{}",
          intervalMinutes: 2,
          customPrompt: null,
          status: "enabled",
          editor: user?.id ?? null,
          naturalLanguageDescription: null,
          spaceId: null,
        },
      });
      setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.MCP_MONITOR);
    },
    [form, user]
  );

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
        case "monitor": {
          const triggerData: AgentBuilderGmailMonitorTriggerType = {
            ...values.monitor,
            kind: "monitor",
            configuration: {
              type: "gmail_messages",
              q: values.monitor.q || null,
              maxResults: values.monitor.maxResults,
              intervalMinutes: values.monitor.intervalMinutes,
            },
          };
          if (triggerData.sId) {
            onAppendTriggerToUpdate(triggerData);
          } else {
            onAppendTriggerToCreate(triggerData);
          }
          break;
        }
        case "mcp-monitor": {
          let input: Record<string, unknown>;
          try {
            input = JSON.parse(values.mcpMonitor.inputJson) as Record<
              string,
              unknown
            >;
          } catch {
            form.setError("mcpMonitor.inputJson", {
              type: "manual",
              message: "Enter a JSON object.",
            });
            return;
          }
          const triggerData: AgentBuilderGmailMonitorTriggerType = {
            name: values.mcpMonitor.name,
            kind: "monitor",
            status: values.mcpMonitor.status,
            customPrompt: values.mcpMonitor.customPrompt,
            naturalLanguageDescription:
              values.mcpMonitor.naturalLanguageDescription,
            editor: values.mcpMonitor.editor,
            spaceId: values.mcpMonitor.spaceId,
            configuration: {
              type: "mcp_tool",
              mcpServerViewId: values.mcpMonitor.mcpServerViewId,
              toolName: values.mcpMonitor.toolName,
              input,
              intervalMinutes: values.mcpMonitor.intervalMinutes,
            },
          };
          onAppendTriggerToCreate(triggerData);
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
        case "monitor": {
          return setCurrentPageId(TRIGGERS_SHEET_PAGE_IDS.MONITOR);
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
          onMCPMonitorSelect={handleMCPMonitorSelect}
          mcpServerViews={mcpServerViews}
          onWebhookSelect={handleWebhookSelect}
          webhookSourceViews={webhookSourceViews}
        />
      ),
    },
    {
      id: TRIGGERS_SHEET_PAGE_IDS.MCP_MONITOR,
      title: selectedMCPServerView
        ? `Create ${getMcpServerViewDisplayName(selectedMCPServerView)} monitor`
        : "Create MCP tool monitor",
      icon: () => getAvatarFromIcon("ActionTimeIcon"),
      content: (
        <MCPToolMonitorEditionSheetContent
          isEditor={isEditor}
          mcpServerView={selectedMCPServerView}
        />
      ),
    },
    {
      id: TRIGGERS_SHEET_PAGE_IDS.MONITOR,
      title: editTrigger
        ? isEditor
          ? "Edit Gmail monitor"
          : "View Gmail monitor"
        : "Create Gmail monitor",
      icon: () => getAvatarFromIcon("ActionTimeIcon"),
      content: (
        <GmailMonitorEditionSheetContent owner={owner} isEditor={isEditor} />
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
            onClick:
              currentPageId !== TRIGGERS_SHEET_PAGE_IDS.SELECTION
                ? handleCancel
                : handleSheetClose,
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
