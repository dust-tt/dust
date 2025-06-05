import React, { createContext, useContext, useMemo, useState } from "react";

import type { GenerationSettingsType } from "@app/components/agent_builder/types";
import { useModels } from "@app/lib/swr/models";
import type { ModelConfigurationType, WorkspaceType } from "@app/types";
import { GPT_4O_MODEL_ID, isSupportingResponseFormat } from "@app/types";

interface AgentBuilderInstructionsContextType {
  generationSettings: GenerationSettingsType;
  setGenerationSettings: (settings: GenerationSettingsType) => void;
  models: ModelConfigurationType[];
}

const AgentBuilderInstructionsContext = createContext<
  AgentBuilderInstructionsContextType | undefined
>(undefined);

interface AgentBuilderInstructionsProviderProps {
  children: React.ReactNode;
  owner: WorkspaceType;
}

export function AgentBuilderInstructionsProvider({
  children,
  owner,
}: AgentBuilderInstructionsProviderProps) {
  const { models } = useModels({ owner });

  const [generationSettings, setGenerationSettings] =
    useState<GenerationSettingsType>({
      modelSettings: {
        modelId: GPT_4O_MODEL_ID,
        providerId: "openai",
      },
      temperature: 0.7,
    });

  const contextValue = useMemo(
    () => ({ generationSettings, setGenerationSettings, models }),
    [generationSettings, models]
  );

  return (
    <AgentBuilderInstructionsContext.Provider value={contextValue}>
      {children}
    </AgentBuilderInstructionsContext.Provider>
  );
}

export function useAgentBuilderInstructionsContext() {
  const context = useContext(AgentBuilderInstructionsContext);
  if (context === undefined) {
    throw new Error(
      "useAgentBuilderInstructionsContext must be used within an AgentBuilderInstructionsProvider"
    );
  }
  return context;
}

export function useAgentBuilderInstructions() {
  const context = useAgentBuilderInstructionsContext();

  const setGenerationSettings = useMemo(
    () => (settings: GenerationSettingsType) => {
      const processedSettings = {
        ...settings,
        responseFormat: isSupportingResponseFormat(
          settings.modelSettings.modelId
        )
          ? settings.responseFormat
          : undefined,
      };

      context.setGenerationSettings(processedSettings);
    },
    [context.setGenerationSettings]
  );

  return {
    generationSettings: context.generationSettings,
    setGenerationSettings,
    models: context.models,
  };
}
