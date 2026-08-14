import type {
  AgentBuilderGmailMonitorTriggerType,
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  formValuesToScheduleTriggerData,
  getScheduleFormDefaultValues,
} from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import type { SheetMode } from "@app/components/agent_builder/triggers/TriggerViewsSheet";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { TriggerViewsSheetFormSchema } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import {
  formValuesToWebhookTriggerData,
  getWebhookFormDefaultValues,
} from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  useCreateTrigger,
  useUpdateTrigger,
} from "@app/lib/swr/agent_triggers";
import { getMonitorableMCPTools } from "@app/lib/triggers/monitorable_mcp_servers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

type PageId =
  | "trigger-selection"
  | "schedule-edition"
  | "mcp-monitor-edition"
  | "webhook-edition";

interface UseTriggerSheetStateParams {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  mode: SheetMode;
  webhookSourceViews: WebhookSourceViewType[];
  onSuccess: () => void;
}

function getPageTitle(
  currentPageId: PageId,
  editTrigger: AgentBuilderTriggerType | null,
  isEditor: boolean,
  webhookSourceView: WebhookSourceViewType | null,
  mcpServerView: MCPServerViewType | null
): string {
  switch (currentPageId) {
    case "trigger-selection":
      return "Add trigger";
    case "schedule-edition":
      if (!editTrigger) {
        return "Create Schedule";
      }
      return isEditor ? "Edit Schedule" : "View Schedule";
    case "mcp-monitor-edition":
      return mcpServerView
        ? `Create ${getMcpServerViewDisplayName(mcpServerView)} monitor`
        : "Create MCP tool monitor";
    case "webhook-edition":
      if (!editTrigger) {
        return webhookSourceView
          ? `Create ${webhookSourceView.customName} Trigger`
          : "Create Trigger";
      }
      return isEditor ? "Edit Trigger" : "View Trigger";
    default:
      assertNever(currentPageId);
  }
}

export function useTriggerSheetState({
  owner,
  agentConfigurationId,
  mode,
  webhookSourceViews,
  onSuccess,
}: UseTriggerSheetStateParams) {
  const { user } = useAuth();

  const [currentPageId, setCurrentPageId] =
    useState<PageId>("trigger-selection");
  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(null);
  const [selectedMCPServerView, setSelectedMCPServerView] =
    useState<MCPServerViewType | null>(null);

  const editTrigger = mode.type === "edit" ? mode.trigger : null;
  const editWebhookSourceView =
    mode.type === "edit" ? mode.webhookSourceView : null;

  const webhookSourceView = editWebhookSourceView ?? selectedWebhookSourceView;
  const isEditor = editTrigger?.editor ? editTrigger.editor === user?.id : true;
  const isOnSelectionPage = currentPageId === "trigger-selection";

  const defaultValues = useMemo((): TriggerViewsSheetFormValues => {
    switch (editTrigger?.kind) {
      case "schedule":
        return {
          type: "schedule",
          schedule: getScheduleFormDefaultValues(editTrigger),
        };
      case "webhook":
        return {
          type: "webhook",
          webhook: getWebhookFormDefaultValues({
            trigger: editTrigger,
            webhookSourceView: editWebhookSourceView,
          }),
        };
      default:
        return {
          type: "schedule",
          schedule: getScheduleFormDefaultValues(null),
        };
    }
  }, [editTrigger, editWebhookSourceView]);

  const form = useForm<TriggerViewsSheetFormValues>({
    defaultValues,
    resolver: zodResolver(TriggerViewsSheetFormSchema),
    mode: "onSubmit",
  });

  const createTrigger = useCreateTrigger({
    workspaceId: owner.sId,
    agentConfigurationId,
  });

  const updateTrigger = useUpdateTrigger({
    workspaceId: owner.sId,
    agentConfigurationId,
  });

  const handleScheduleSelect = useCallback(() => {
    form.reset({
      type: "schedule",
      schedule: getScheduleFormDefaultValues(null),
    });
    setCurrentPageId("schedule-edition");
  }, [form]);

  const handleWebhookSelect = useCallback(
    (wsv: WebhookSourceViewType) => {
      setSelectedWebhookSourceView(wsv);
      form.reset({
        type: "webhook",
        webhook: getWebhookFormDefaultValues({
          trigger: null,
          webhookSourceView: wsv,
        }),
      });
      setCurrentPageId("webhook-edition");
    },
    [form]
  );

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
      setCurrentPageId("mcp-monitor-edition");
    },
    [form, user]
  );

  const handleCancel = useCallback(() => {
    setCurrentPageId("trigger-selection");
    setSelectedWebhookSourceView(null);
    setSelectedMCPServerView(null);
  }, []);

  const handleFormSubmit = useCallback(
    async (values: TriggerViewsSheetFormValues) => {
      if (!user) {
        return;
      }

      let success = false;

      switch (values.type) {
        case "schedule": {
          const triggerData: AgentBuilderScheduleTriggerType =
            formValuesToScheduleTriggerData({
              schedule: values.schedule,
              editTrigger,
              user,
            });

          const payload = {
            name: triggerData.name,
            kind: "schedule" as const,
            customPrompt: triggerData.customPrompt ?? "",
            naturalLanguageDescription: triggerData.naturalLanguageDescription,
            configuration: triggerData.configuration,
            status: triggerData.status,
            spaceId: triggerData.spaceId,
          };

          if (triggerData.sId) {
            success = await updateTrigger({ sId: triggerData.sId, ...payload });
          } else {
            success = await createTrigger(payload);
          }
          break;
        }
        case "webhook": {
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

          const payload = {
            name: triggerData.name,
            kind: "webhook" as const,
            customPrompt: triggerData.customPrompt ?? "",
            naturalLanguageDescription: triggerData.naturalLanguageDescription,
            configuration: triggerData.configuration,
            webhookSourceViewId: triggerData.webhookSourceViewId ?? "",
            executionPerDayLimitOverride:
              triggerData.executionPerDayLimitOverride ?? 0,
            status: triggerData.status,
            spaceId: triggerData.spaceId,
          };

          if (triggerData.sId) {
            success = await updateTrigger({ sId: triggerData.sId, ...payload });
          } else {
            success = await createTrigger(payload);
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
          success = await createTrigger({
            name: triggerData.name,
            kind: "monitor",
            customPrompt: triggerData.customPrompt ?? "",
            naturalLanguageDescription: triggerData.naturalLanguageDescription,
            configuration: triggerData.configuration,
            status: triggerData.status,
            spaceId: triggerData.spaceId,
          });
          break;
        }
      }

      if (success) {
        onSuccess();
      }
    },
    [
      user,
      editTrigger,
      webhookSourceView,
      createTrigger,
      updateTrigger,
      onSuccess,
      form,
    ]
  );

  // Reset form and page when mode changes.
  useEffect(() => {
    form.reset(defaultValues);
    if (mode.type === "edit") {
      switch (mode.trigger.kind) {
        case "schedule":
          setCurrentPageId("schedule-edition");
          return;
        case "webhook":
          setSelectedWebhookSourceView(mode.webhookSourceView);
          setCurrentPageId("webhook-edition");
          return;
      }
    }
    setCurrentPageId("trigger-selection");
    setSelectedWebhookSourceView(null);
    setSelectedMCPServerView(null);
  }, [defaultValues, form, mode]);

  const pageTitle = getPageTitle(
    currentPageId,
    editTrigger,
    isEditor,
    webhookSourceView,
    selectedMCPServerView
  );

  return {
    form,
    currentPageId,
    webhookSourceView,
    selectedMCPServerView,
    editTrigger,
    isEditor,
    isOnSelectionPage,
    pageTitle,
    handleScheduleSelect,
    handleWebhookSelect,
    handleMCPMonitorSelect,
    handleCancel,
    handleFormSubmit,
  };
}
