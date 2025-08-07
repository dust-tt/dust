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
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import {
  getDefaultAgentFormData,
  transformAgentConfigurationToFormData,
} from "@app/components/agent_builder/transformAgentConfiguration";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAgentConfigurationActions } from "@app/lib/swr/actions";
import { useEditors } from "@app/lib/swr/editors";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types";

interface AgentBuilderProps {
  agentConfiguration?: LightAgentConfigurationType;
}

export default function AgentBuilder({
  agentConfiguration,
}: AgentBuilderProps) {
  const { owner, user } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
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
    return getDefaultAgentFormData(user);
  }, [agentConfiguration, user]);

  // Create values object that includes async data (actions and editors)
  const formValues = useMemo((): AgentBuilderFormData | undefined => {
    // Don't show form data until MCP server views are loaded
    // This prevents transformation errors when data source views are not available
    if (isMCPServerViewsLoading) {
      return undefined;
    }

    const hasActions = actions && actions.length > 0;
    const hasEditors = editors && editors.length > 0;

    // Determine Slack provider based on supported data source views
    const slackProvider = supportedDataSourceViews.find(
      (dsv) => dsv.dataSource.connectorProvider === "slack_bot"
    )
      ? "slack_bot"
      : supportedDataSourceViews.find(
            (dsv) => dsv.dataSource.connectorProvider === "slack"
          )
        ? "slack"
        : defaultValues.agentSettings.slackProvider;

    if (
      !hasActions &&
      !hasEditors &&
      slackProvider === defaultValues.agentSettings.slackProvider
    ) {
      return undefined; // Let defaultValues handle initial state
    }

    const updatedValues = { ...defaultValues };

    if (hasActions) {
      updatedValues.actions = actions;
    }

    if (hasEditors) {
      updatedValues.agentSettings = {
        ...updatedValues.agentSettings,
        editors,
      };
    }

    if (slackProvider !== defaultValues.agentSettings.slackProvider) {
      updatedValues.agentSettings = {
        ...updatedValues.agentSettings,
        slackProvider,
      };
    }

    return updatedValues;
  }, [
    defaultValues,
    actions,
    editors,
    supportedDataSourceViews,
    isMCPServerViewsLoading,
  ]);

  const form = useForm<AgentBuilderFormData>({
    resolver: zodResolver(agentBuilderFormSchema),
    defaultValues,
    values: formValues, // Reactive updates when actions are loaded
  });

  const handleSubmit = async (formData: AgentBuilderFormData) => {
    try {
      const result = await submitAgentBuilderForm({
        formData,
        owner,
        mcpServerViews,
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
      } else {
        const createdAgent = result.value;
        sendNotification({
          title: agentConfiguration ? "Agent saved" : "Agent created",
          description: agentConfiguration
            ? "Your agent has been successfully saved"
            : "Your agent has been successfully created",
          type: "success",
        });

        // If this was a new agent creation, update URL without re-rendering
        if (!agentConfiguration && createdAgent.sId) {
          const newUrl = `/w/${owner.sId}/builder/agents/${createdAgent.sId}`;
          window.history.replaceState(null, "", newUrl);
        }
      }
    } catch (error) {
      logger.error("Unexpected error:", error);
    }
  };

  const handleSave = () => {
    void form.handleSubmit(handleSubmit)();
  };

  // Subscribe to form state changes by destructuring before render
  const { isDirty, isSubmitting } = form.formState;

  return (
    <FormProvider form={form}>
      <AgentBuilderLayout
        leftPanel={
          <AgentBuilderLeftPanel
            title={
              agentConfiguration
                ? `Edit agent ${agentConfiguration.name}`
                : "Create new agent"
            }
            onCancel={async () => {
              await appLayoutBack(owner, router);
            }}
            saveButtonProps={{
              size: "sm",
              label: isSubmitting ? "Saving..." : "Save",
              variant: "primary",
              onClick: handleSave,
              disabled:
                !isDirty ||
                isSubmitting ||
                isMCPServerViewsLoading ||
                isActionsLoading,
            }}
            agentConfigurationId={agentConfiguration?.sId || null}
          />
        }
        rightPanel={
          <AgentBuilderRightPanel
            agentConfigurationSId={agentConfiguration?.sId}
          />
        }
      />
    </FormProvider>
  );
}
