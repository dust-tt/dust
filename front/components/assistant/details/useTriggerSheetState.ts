import type {
  AgentBuilderScheduleTriggerType,
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
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  useCreateTrigger,
  useUpdateTrigger,
} from "@app/lib/swr/agent_triggers";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

type PageId = "trigger-selection" | "schedule-edition" | "webhook-edition";

const PAGE_IDS = {
  SELECTION: "trigger-selection",
  SCHEDULE: "schedule-edition",
  WEBHOOK: "webhook-edition",
} as const satisfies Record<string, PageId>;

interface UseTriggerSheetStateParams {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  mode: SheetMode;
  webhookSourceViews: WebhookSourceViewType[];
  onSuccess: () => void;
}

export function useTriggerSheetState({
  owner,
  agentConfigurationId,
  mode,
  webhookSourceViews,
  onSuccess,
}: UseTriggerSheetStateParams) {
  const { user } = useAuth();

  const [currentPageId, setCurrentPageId] = useState<PageId>(
    PAGE_IDS.SELECTION
  );
  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(null);

  const editTrigger = mode.type === "edit" ? mode.trigger : null;
  const editWebhookSourceView =
    mode.type === "edit" ? mode.webhookSourceView : null;

  const webhookSourceView = editWebhookSourceView ?? selectedWebhookSourceView;

  const isEditor = editTrigger?.editor ? editTrigger.editor === user?.id : true;

  const isOnSelectionPage = currentPageId === PAGE_IDS.SELECTION;

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
    setCurrentPageId(PAGE_IDS.SCHEDULE);
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
      setCurrentPageId(PAGE_IDS.WEBHOOK);
    },
    [form]
  );

  const handleCancel = useCallback(() => {
    setCurrentPageId(PAGE_IDS.SELECTION);
    setSelectedWebhookSourceView(null);
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
            editor: undefined,
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
            webhookSourceViewSId: triggerData.webhookSourceViewSId ?? "",
            executionPerDayLimitOverride:
              triggerData.executionPerDayLimitOverride ?? 0,
            editor: undefined,
          };

          if (triggerData.sId) {
            success = await updateTrigger({ sId: triggerData.sId, ...payload });
          } else {
            success = await createTrigger(payload);
          }
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
          setCurrentPageId(PAGE_IDS.SCHEDULE);
          return;
        case "webhook":
          setSelectedWebhookSourceView(mode.webhookSourceView);
          setCurrentPageId(PAGE_IDS.WEBHOOK);
          return;
      }
    }
    setCurrentPageId(PAGE_IDS.SELECTION);
    setSelectedWebhookSourceView(null);
  }, [defaultValues, form, mode]);

  let pageTitle: string;
  if (isOnSelectionPage) {
    pageTitle = "Add trigger";
  } else if (currentPageId === PAGE_IDS.SCHEDULE) {
    if (editTrigger) {
      pageTitle = isEditor ? "Edit Schedule" : "View Schedule";
    } else {
      pageTitle = "Create Schedule";
    }
  } else {
    if (editTrigger) {
      pageTitle = isEditor ? "Edit Trigger" : "View Trigger";
    } else if (webhookSourceView) {
      pageTitle = `Create ${webhookSourceView.customName} Trigger`;
    } else {
      pageTitle = "Create Trigger";
    }
  }

  return {
    form,
    currentPageId,
    webhookSourceView,
    editTrigger,
    isEditor,
    isOnSelectionPage,
    pageTitle,
    handleScheduleSelect,
    handleWebhookSelect,
    handleCancel,
    handleFormSubmit,
  };
}
