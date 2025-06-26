import { zodResolver } from "@hookform/resolvers/zod";
import React, { useState } from "react";
import { useForm } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  AgentBuilderFormProvider,
  agentBuilderFormSchema,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { GPT_4O_MODEL_ID } from "@app/types";

export default function AgentBuilder() {
  const { owner } = useAgentBuilderContext();
  const [isSaving, setIsSaving] = useState(false);

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
        console.log("Agent created successfully:", result.value);
        // TODO: Navigate to agent page or show success message
      } else {
        console.error("Failed to create agent:", result.error.message);
        // TODO: Show error message to user
      }
    } catch (error) {
      console.error("Unexpected error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    // Trigger form submission
    form.handleSubmit(handleSubmit)();
  };

  return (
    <AgentBuilderFormProvider form={form} onSubmit={handleSubmit}>
      <AgentBuilderLayout
        leftPanel={
          <AgentBuilderLeftPanel
            title="Create new agent"
            onCancel={() => console.log("Cancel")}
            onSave={handleSave}
            isSaving={isSaving}
          />
        }
        rightPanel={<AgentBuilderRightPanel />}
      />
    </AgentBuilderFormProvider>
  );
}
