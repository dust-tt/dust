import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useForm } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  AgentBuilderFormProvider,
  agentBuilderFormSchema,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { GPT_4O_MODEL_ID } from "@app/types";

export default function AgentBuilder() {
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
        },
        temperature: 0.7,
      },
      actions: [],
    },
  });

  return (
    <AgentBuilderFormProvider form={form}>
      <AgentBuilderLayout
        leftPanel={
          <AgentBuilderLeftPanel
            title="Create new agent"
            onCancel={() => console.log("Cancel")}
            onSave={() => console.log("Save")}
          />
        }
        rightPanel={<AgentBuilderRightPanel />}
      />
    </AgentBuilderFormProvider>
  );
}
