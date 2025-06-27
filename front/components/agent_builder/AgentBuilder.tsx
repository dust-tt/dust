import { zodResolver } from "@hookform/resolvers/zod";
import { useSendNotification } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useState } from "react";
import { useForm } from "react-hook-form";

import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  AgentBuilderFormProvider,
  agentBuilderFormSchema,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import { GPT_4O_MODEL_ID } from "@app/types";
import logger from "@app/logger/logger";

export default function AgentBuilder() {
  const { owner } = useAgentBuilderContext();
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const sendNotification = useSendNotification();

  const form = useForm<AgentBuilderFormData>({
    resolver: zodResolver(agentBuilderFormSchema),
    defaultValues: {
      agentSettings: {
        name: "",
        description: "",
      },
      instructions: "",
      generationSettings: {
        modelSettings: {
          modelId: GPT_4O_MODEL_ID,
          providerId: "openai",
          reasoningEffort: undefined,
        },
        temperature: 0.7,
      },
      actions: [],
      maxStepsPerRun: 10,
    },
  });

  const handleSubmit = async (formData: AgentBuilderFormData) => {
    setIsSaving(true);
    try {
      const result = await submitAgentBuilderForm({
        formData,
        owner,
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
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    void form.handleSubmit(handleSubmit)();
  };

  return (
    <AgentBuilderFormProvider form={form} onSubmit={handleSubmit}>
      <AgentBuilderLayout
        leftPanel={
          <AgentBuilderLeftPanel
            title="Create new agent"
            onCancel={async () => {
              await appLayoutBack(owner, router);
            }}
            onSave={handleSave}
            isSaving={isSaving}
          />
        }
        rightPanel={<AgentBuilderRightPanel />}
      />
    </AgentBuilderFormProvider>
  );
}
