import { zodResolver } from "@hookform/resolvers/zod";
import set from "lodash/set";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { AdditionalConfigurationInBuilderType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderFormContext } from "@app/components/agent_builder/AgentBuilderFormContext";
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
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AssistantBuilderMCPConfigurationWithId } from "@app/components/assistant_builder/types";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import type { AdditionalConfigurationType } from "@app/lib/models/assistant/actions/mcp";
import { useAgentConfigurationActions } from "@app/lib/swr/actions";
import { useAgentTriggers } from "@app/lib/swr/agent_triggers";
import { useEditors } from "@app/lib/swr/editors";
import { emptyArray } from "@app/lib/swr/swr";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types";

function processActionsFromStorage(
  actions: AssistantBuilderMCPConfigurationWithId[]
): AgentBuilderAction[] {
  return actions.map((action) => {
    if (action.type === "MCP") {
      return {
        ...action,
        configuration: {
          ...action.configuration,
          additionalConfiguration: processAdditionalConfigurationFromStorage(
            action.configuration.additionalConfiguration
          ),
        },
      };
    }
    return action;
  });
}

function processAdditionalConfigurationFromStorage(
  config: AdditionalConfigurationType
): AdditionalConfigurationInBuilderType {
  const additionalConfig: AdditionalConfigurationInBuilderType = {};

  for (const [key, value] of Object.entries(config)) {
    set(additionalConfig, key, value);
  }

  return additionalConfig;
}

interface AgentBuilderProps {
  agentConfiguration?: LightAgentConfigurationType;
}

export default function AgentBuilder({
  agentConfiguration,
}: AgentBuilderProps) {
  const { owner, user, assistantTemplate } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();

  const router = useRouter();
  const sendNotification = useSendNotification();

  const { actions, isActionsLoading } = useAgentConfigurationActions(
    owner.sId,
    agentConfiguration?.sId ?? null
  );

  const { triggers, isTriggersLoading } = useAgentTriggers({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration?.sId ?? null,
  });

  const { editors } = useEditors({
    owner,
    agentConfigurationId: agentConfiguration?.sId ?? null,
  });

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

  const processedActions = useMemo(() => {
    return processActionsFromStorage(actions ?? emptyArray());
  }, [actions]);

  const formValues = useMemo((): AgentBuilderFormData => {
    let baseValues: AgentBuilderFormData;

    if (agentConfiguration) {
      baseValues = transformAgentConfigurationToFormData(agentConfiguration);
    } else if (assistantTemplate) {
      baseValues = transformTemplateToFormData(assistantTemplate, user);
    } else {
      baseValues = getDefaultAgentFormData(user);
    }

    return {
      ...baseValues,
      actions: processedActions,
      triggers: triggers ?? emptyArray(),
      agentSettings: {
        ...baseValues.agentSettings,
        slackProvider,
        editors: editors ?? emptyArray(),
      },
    };
  }, [
    agentConfiguration,
    assistantTemplate,
    user,
    processedActions,
    slackProvider,
    editors,
    triggers,
  ]);

  const form = useForm<AgentBuilderFormData>({
    resolver: zodResolver(agentBuilderFormSchema),
    values: formValues,
    resetOptions: {
      keepDirtyValues: true,
      keepErrors: true,
    },
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

  useNavigationLock(isDirty);

  const isSaveDisabled =
    !isDirty || isSubmitting || isActionsLoading || isTriggersLoading;

  const saveLabel = isSubmitting ? "Saving..." : "Save";

  const title = agentConfiguration
    ? `Edit agent @${agentConfiguration.name}`
    : "Create new agent";

  return (
    <AgentBuilderFormContext.Provider value={form}>
      <FormProvider form={form}>
        <AgentBuilderLayout
          leftPanel={
            <AgentBuilderLeftPanel
              title={title}
              onCancel={handleCancel}
              saveButtonProps={{
                size: "sm",
                label: saveLabel,
                variant: "highlight",
                onClick: handleSave,
                disabled: isSaveDisabled,
              }}
              agentConfigurationId={agentConfiguration?.sId || null}
              isActionsLoading={isActionsLoading}
              isTriggersLoading={isTriggersLoading}
            />
          }
          rightPanel={
            <ConversationSidePanelProvider>
              <AgentBuilderRightPanel
                agentConfigurationSId={agentConfiguration?.sId}
              />
            </ConversationSidePanelProvider>
          }
        />
      </FormProvider>
    </AgentBuilderFormContext.Provider>
  );
}
