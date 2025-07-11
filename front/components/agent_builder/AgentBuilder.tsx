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
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types";
import {
  EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

interface AgentBuilderProps {
  agentConfiguration?: LightAgentConfigurationType;
}

export default function AgentBuilder({
  agentConfiguration,
}: AgentBuilderProps) {
  const { owner, user, supportedDataSourceViews } = useAgentBuilderContext();
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const router = useRouter();
  const sendNotification = useSendNotification();

  const { actions, isActionsLoading } = useAgentConfigurationActions(
    owner.sId,
    agentConfiguration?.sId ?? null,
    mcpServerViews
  );

  const { editors, isEditorsLoading } = useEditors({
    owner,
    agentConfigurationId: agentConfiguration?.sId ?? null,
  });

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const defaultMaxSteps = hasFeature("extended_max_steps_per_run")
    ? EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT
    : MAX_STEPS_USE_PER_RUN_LIMIT;

  const defaultValues = useMemo((): AgentBuilderFormData => {
    if (agentConfiguration) {
      return transformAgentConfigurationToFormData(agentConfiguration);
    }
    return getDefaultAgentFormData(user, defaultMaxSteps);
  }, [agentConfiguration, user, defaultMaxSteps]);

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

      if (result.isOk()) {
        await router.push(`/w/${owner.sId}/builder/assistants`);
      } else {
        sendNotification({
          title: agentConfiguration
            ? "Error updating agent"
            : "Error creating agent",
          description: result.error.message,
          type: "error",
        });
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
    <FormProvider form={form} onSubmit={handleSubmit}>
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
                isActionsLoading ||
                isEditorsLoading,
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
