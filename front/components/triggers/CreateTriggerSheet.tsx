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
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useCreateTriggerFromManage } from "@app/lib/swr/agent_triggers";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSpaces } from "@app/lib/swr/spaces";
import { useWebhookSourceViewsFromSpaces } from "@app/lib/swr/webhook_source";
import { filterAndSortAgents } from "@app/lib/utils";
import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  Avatar,
  MultiPageSheet,
  MultiPageSheetContent,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

const CREATE_SHEET_PAGE_IDS = {
  AGENT_SELECTION: "agent-selection",
  TRIGGER_SELECTION: "trigger-selection",
  SCHEDULE: "schedule-edition",
  WEBHOOK: "webhook-edition",
} as const;

interface AgentSelectionPageContentProps {
  onAgentSelect: (agent: LightAgentConfigurationType) => void;
}

function AgentSelectionPageContent({
  onAgentSelect,
}: AgentSelectionPageContentProps) {
  const owner = useWorkspace();
  const [searchTerm, setSearchTerm] = useState("");

  const { agentConfigurations, isAgentConfigurationsLoading } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list",
      sort: "alphabetical",
    });

  const filteredAgents = useMemo(
    () => filterAndSortAgents(agentConfigurations, searchTerm),
    [agentConfigurations, searchTerm]
  );

  return (
    <>
      <SearchInput
        placeholder="Search agents..."
        value={searchTerm}
        onChange={setSearchTerm}
        name="agentSearch"
        className="mt-4"
      />

      {isAgentConfigurationsLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No agents found
        </div>
      ) : (
        <div className="flex flex-col gap-1 py-2">
          {filteredAgents.map((agent) => (
            <button
              key={agent.sId}
              type="button"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
              onClick={() => onAgentSelect(agent)}
            >
              <Avatar size="sm" visual={agent.pictureUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  @{agent.name}
                </div>
                {agent.description && (
                  <div className="truncate text-xs text-muted-foreground">
                    {agent.description}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

interface CreateTriggerSheetProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateTriggerSheet({
  open,
  onClose,
  onSuccess,
}: CreateTriggerSheetProps) {
  const owner = useWorkspace();
  const { user } = useAuth();

  const [currentPageId, setCurrentPageId] = useState<string>(
    CREATE_SHEET_PAGE_IDS.AGENT_SELECTION
  );
  const [selectedAgent, setSelectedAgent] =
    useState<LightAgentConfigurationType | null>(null);
  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
  });

  const { webhookSourceViews } = useWebhookSourceViewsFromSpaces(owner, spaces);

  const createTrigger = useCreateTriggerFromManage({
    workspaceId: owner.sId,
  });

  const form = useForm<TriggerViewsSheetFormValues>({
    defaultValues: {
      type: "schedule",
      schedule: getScheduleFormDefaultValues(null),
    },
    resolver: zodResolver(TriggerViewsSheetFormSchema),
    mode: "onSubmit",
  });

  const handleSheetClose = useCallback(() => {
    setSelectedAgent(null);
    setSelectedWebhookSourceView(null);
    setCurrentPageId(CREATE_SHEET_PAGE_IDS.AGENT_SELECTION);
    form.reset({
      type: "schedule",
      schedule: getScheduleFormDefaultValues(null),
    });
    onClose();
  }, [form, onClose]);

  const handleAgentSelect = useCallback(
    (agent: LightAgentConfigurationType) => {
      setSelectedAgent(agent);
      setCurrentPageId(CREATE_SHEET_PAGE_IDS.TRIGGER_SELECTION);
    },
    []
  );

  const handleScheduleSelect = useCallback(() => {
    form.reset({
      type: "schedule",
      schedule: getScheduleFormDefaultValues(null),
    });
    setCurrentPageId(CREATE_SHEET_PAGE_IDS.SCHEDULE);
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
      setCurrentPageId(CREATE_SHEET_PAGE_IDS.WEBHOOK);
    },
    [form]
  );

  const handleFormSubmit = useCallback(
    async (values: TriggerViewsSheetFormValues) => {
      if (!user || !selectedAgent) {
        return;
      }

      setIsSaving(true);

      try {
        let triggerData: Record<string, unknown>;

        switch (values.type) {
          case "schedule": {
            triggerData = formValuesToScheduleTriggerData({
              schedule: values.schedule,
              editTrigger: null,
              user,
            });
            break;
          }
          case "webhook": {
            if (selectedWebhookSourceView?.provider && !values.webhook.event) {
              form.setError("webhook.event", {
                type: "manual",
                message: "Please select an event",
              });
              setIsSaving(false);
              return;
            }

            triggerData = formValuesToWebhookTriggerData({
              webhook: values.webhook,
              editTrigger: null,
              user,
              webhookSourceView: selectedWebhookSourceView,
            });
            break;
          }
        }

        const success = await createTrigger(selectedAgent.sId, triggerData);

        if (success) {
          onSuccess();
          handleSheetClose();
        }
      } finally {
        setIsSaving(false);
      }
    },
    [
      user,
      selectedAgent,
      selectedWebhookSourceView,
      createTrigger,
      onSuccess,
      handleSheetClose,
      form,
    ]
  );

  const handleCancel = useCallback(() => {
    const isOnEditionPage =
      currentPageId === CREATE_SHEET_PAGE_IDS.SCHEDULE ||
      currentPageId === CREATE_SHEET_PAGE_IDS.WEBHOOK;

    if (isOnEditionPage) {
      setSelectedWebhookSourceView(null);
      setCurrentPageId(CREATE_SHEET_PAGE_IDS.TRIGGER_SELECTION);
    } else if (currentPageId === CREATE_SHEET_PAGE_IDS.TRIGGER_SELECTION) {
      setSelectedAgent(null);
      setCurrentPageId(CREATE_SHEET_PAGE_IDS.AGENT_SELECTION);
    } else {
      handleSheetClose();
    }
  }, [currentPageId, handleSheetClose]);

  const isOnEditionPage =
    currentPageId === CREATE_SHEET_PAGE_IDS.SCHEDULE ||
    currentPageId === CREATE_SHEET_PAGE_IDS.WEBHOOK;

  const pages: MultiPageSheetPage[] = [
    {
      id: CREATE_SHEET_PAGE_IDS.AGENT_SELECTION,
      title: "Select an agent",
      content: <AgentSelectionPageContent onAgentSelect={handleAgentSelect} />,
    },
    {
      id: CREATE_SHEET_PAGE_IDS.TRIGGER_SELECTION,
      title: selectedAgent
        ? `Add trigger for @${selectedAgent.name}`
        : "Select trigger type",
      content: (
        <TriggerSelectionPageContent
          onScheduleSelect={handleScheduleSelect}
          onWebhookSelect={handleWebhookSelect}
          webhookSourceViews={webhookSourceViews}
        />
      ),
    },
    {
      id: CREATE_SHEET_PAGE_IDS.SCHEDULE,
      title: "Create Schedule",
      icon: () => getAvatarFromIcon("ActionTimeIcon"),
      content: (
        <ScheduleEditionSheetContent
          owner={owner}
          trigger={null}
          isEditor={true}
        />
      ),
    },
    {
      id: CREATE_SHEET_PAGE_IDS.WEBHOOK,
      title: selectedWebhookSourceView
        ? `Create ${selectedWebhookSourceView.customName} Trigger`
        : "Create Trigger",
      icon: () =>
        getAvatarFromIcon(
          normalizeWebhookIcon(selectedWebhookSourceView?.icon)
        ),
      content: (
        <WebhookEditionSheetContent
          owner={owner}
          trigger={null}
          agentConfigurationId={selectedAgent?.sId ?? null}
          webhookSourceView={selectedWebhookSourceView}
          isEditor={true}
        />
      ),
    },
  ];

  return (
    <FormProvider form={form} onSubmit={handleFormSubmit}>
      <MultiPageSheet
        open={open}
        onOpenChange={(isOpen) => !isOpen && handleSheetClose()}
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
              currentPageId === CREATE_SHEET_PAGE_IDS.AGENT_SELECTION
                ? "Close"
                : "Back",
            variant: "outline",
            onClick: handleCancel,
          }}
          rightButton={
            isOnEditionPage
              ? {
                  label: "Save",
                  variant: "primary",
                  disabled: isSaving,
                  onClick: form.handleSubmit(handleFormSubmit),
                }
              : undefined
          }
        />
      </MultiPageSheet>
    </FormProvider>
  );
}
