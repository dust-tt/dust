import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { agentBuilderFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import {
  getDefaultAgentFormData,
  transformAgentConfigurationToFormData,
} from "@app/components/agent_builder/transformAgentConfiguration";
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import logger from "@app/logger/logger";
import type { AgentConfigurationType, UserType } from "@app/types";
import {
  EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

interface AgentBuilderProps {
  agentConfiguration?: AgentConfigurationType;
  agentEditors?: UserType[];
}

export default function AgentBuilder({
  agentConfiguration,
  agentEditors,
}: AgentBuilderProps) {
  const { owner, user, supportedDataSourceViews } = useAgentBuilderContext();
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const router = useRouter();
  const sendNotification = useSendNotification();

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const hasExtendedFeature = hasFeature("extended_max_steps_per_run");
  const defaultMaxSteps = hasExtendedFeature
    ? Math.min(10, EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT)
    : Math.min(10, MAX_STEPS_USE_PER_RUN_LIMIT);

  const getInitialFormData = (): AgentBuilderFormData => {
    if (agentConfiguration) {
      return transformAgentConfigurationToFormData(
        agentConfiguration,
        user,
        agentEditors || []
      );
    }
    return getDefaultAgentFormData(user, defaultMaxSteps);
  };

  const form = useForm<AgentBuilderFormData>({
    resolver: zodResolver(agentBuilderFormSchema),
    defaultValues: getInitialFormData(),
  });

  useEffect(() => {
    if (
      supportedDataSourceViews.find(
        (dsv) => dsv.dataSource.connectorProvider === "slack_bot"
      )
    ) {
      form.setValue("agentSettings.slackProvider", "slack_bot");
    } else if (
      supportedDataSourceViews.find(
        (dsv) => dsv.dataSource.connectorProvider === "slack"
      )
    ) {
      form.setValue("agentSettings.slackProvider", "slack");
    }
  }, [supportedDataSourceViews, form]);

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
            onSave={handleSave}
            isSaving={form.formState.isSubmitting}
            isDisabled={isMCPServerViewsLoading}
          />
        }
        rightPanel={
          <AgentBuilderRightPanel agentConfiguration={agentConfiguration} />
        }
      />
    </FormProvider>
  );
}
