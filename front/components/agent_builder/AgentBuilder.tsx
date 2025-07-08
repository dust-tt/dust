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
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import logger from "@app/logger/logger";
import {
  EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT,
  GPT_4O_MODEL_CONFIG,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

export default function AgentBuilder() {
  const { owner, user, supportedDataSourceViews } = useAgentBuilderContext();
  const { mcpServerViews } = useMCPServerViewsContext();
  const router = useRouter();
  const sendNotification = useSendNotification();

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const hasExtendedFeature = hasFeature("extended_max_steps_per_run");
  const defaultMaxSteps = hasExtendedFeature
    ? Math.min(10, EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT)
    : Math.min(10, MAX_STEPS_USE_PER_RUN_LIMIT);

  const form = useForm<AgentBuilderFormData>({
    resolver: zodResolver(agentBuilderFormSchema),
    defaultValues: {
      agentSettings: {
        name: "",
        description: "",
        pictureUrl: "",
        scope: "hidden",
        editors: [user],
        slackProvider: null,
        slackChannels: [],
        tags: [],
      },
      instructions: "",
      generationSettings: {
        modelSettings: {
          modelId: GPT_4O_MODEL_CONFIG.modelId,
          providerId: "openai",
        },
        temperature: 0.7,
        reasoningEffort: GPT_4O_MODEL_CONFIG.defaultReasoningEffort,
      },
      actions: [],
      maxStepsPerRun: defaultMaxSteps,
    },
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
      });

      if (result.isOk()) {
        await router.push(`/w/${owner.sId}/builder/assistants`);
      } else {
        sendNotification({
          title: "Error creating agent",
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
            title="Create new agent"
            onCancel={async () => {
              await appLayoutBack(owner, router);
            }}
            onSave={handleSave}
            isSaving={form.formState.isSubmitting}
          />
        }
        rightPanel={<AgentBuilderRightPanel />}
      />
    </FormProvider>
  );
}
