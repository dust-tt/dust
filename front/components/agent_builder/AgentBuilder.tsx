import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { agentBuilderFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import {
  getDefaultAgentFormData,
  transformAgentConfigurationToFormData,
  transformTemplateToFormData,
} from "@app/components/agent_builder/transformAgentConfiguration";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAgentConfigurationActions } from "@app/lib/swr/actions";
import { useEditors } from "@app/lib/swr/editors";
import { emptyArray } from "@app/lib/swr/swr";
import logger from "@app/logger/logger";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { LightAgentConfigurationType } from "@app/types";

interface AgentBuilderProps {
  agentConfiguration?: LightAgentConfigurationType;
  assistantTemplate: FetchAssistantTemplateResponse | null;
}

export default function AgentBuilder({
  agentConfiguration,
  assistantTemplate,
}: AgentBuilderProps) {
  const { owner, user } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();

  const router = useRouter();
  const sendNotification = useSendNotification();

  const { actions, isActionsLoading } = useAgentConfigurationActions(
    owner.sId,
    agentConfiguration?.sId ?? null
  );

  const { editors } = useEditors({
    owner,
    agentConfigurationId: agentConfiguration?.sId ?? null,
  });

  const defaultValues = useMemo((): AgentBuilderFormData => {
    if (agentConfiguration) {
      return transformAgentConfigurationToFormData(agentConfiguration);
    }
    
    if (assistantTemplate) {
      return transformTemplateToFormData(assistantTemplate, user);
    }
    
    return getDefaultAgentFormData(user);
  }, [agentConfiguration, assistantTemplate, user]);

  const slackProvider = useMemo(() => {
    const slackBotProvider = supportedDataSourceViews.find(
      (dsv) => dsv.dataSource.connectorProvider === "slack_bot"
    );
    if (slackBotProvider) {
      return "slack_bot";
    }

    const slackProvider = supportedDataSourceViews.find(
      (dsv) => dsv.dataSource.connectorProvider === "slack"
    );
    return slackProvider ? "slack" : null;
  }, [supportedDataSourceViews]);

  const form = useForm<AgentBuilderFormData>({
    resolver: zodResolver(agentBuilderFormSchema),
    defaultValues,
    values: {
      ...defaultValues,
      actions: actions ?? emptyArray(),
      agentSettings: {
        ...defaultValues.agentSettings,
        slackProvider,
        editors,
      },
    },
    resetOptions: { keepDefaultValues: true },
  });

  const handleSubmit = async (formData: AgentBuilderFormData) => {
    try {
      const result = await submitAgentBuilderForm({
        formData,
        owner,
        isDraft: false,
        agentConfigurationId: agentConfiguration?.sId || null,
      });

      if (!result.isOk()) {
        sendNotification({
          title: agentConfiguration
            ? "Error updating agent"
            : "Error creating agent",
          description: result.error.message,
          type: "error",
        });
        return;
      }

      const createdAgent = result.value;
      sendNotification({
        title: agentConfiguration ? "Agent saved" : "Agent created",
        description: agentConfiguration
          ? "Your agent has been successfully saved"
          : "Your agent has been successfully created",
        type: "success",
      });

      if (!agentConfiguration && createdAgent.sId) {
        const newUrl = `/w/${owner.sId}/builder/agents/${createdAgent.sId}`;
        window.history.replaceState(null, "", newUrl);
      }
    } catch (error) {
      logger.error("Unexpected error:", error);
    }
  };

  const handleSave = () => {
    void form.handleSubmit(handleSubmit)();
  };

  const handleCancel = async () => {
    await appLayoutBack(owner, router);
  };

  const { isDirty, isSubmitting } = form.formState;

  const isSaveDisabled = !isDirty || isSubmitting || isActionsLoading;

  const saveLabel = isSubmitting ? "Saving..." : "Save";

  const title = agentConfiguration
    ? `Edit agent @${agentConfiguration.name}`
    : "Create new agent";

  return (
    <FormProvider form={form}>
      <AgentBuilderLayout
        leftPanel={
          <AgentBuilderLeftPanel
            title={title}
            onCancel={handleCancel}
            saveButtonProps={{
              size: "sm",
              label: saveLabel,
              variant: "primary",
              onClick: handleSave,
              disabled: isSaveDisabled,
            }}
            agentConfigurationId={agentConfiguration?.sId || null}
            isActionsLoading={isActionsLoading}
          />
        }
        rightPanel={
          <ConversationSidePanelProvider>
            <AgentBuilderRightPanel
              agentConfigurationSId={agentConfiguration?.sId}
              assistantTemplate={assistantTemplate}
            />
          </ConversationSidePanelProvider>
        }
      />
    </FormProvider>
  );
}
