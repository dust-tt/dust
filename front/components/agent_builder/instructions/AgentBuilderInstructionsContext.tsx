import React, { createContext, useContext, useMemo, useState } from "react";
import { useCallback } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { GenerationSettingsType } from "@app/components/agent_builder/types";
import { useModels } from "@app/lib/swr/models";
import type { ModelConfigurationType } from "@app/types";
import { GPT_4O_MODEL_ID, isSupportingResponseFormat } from "@app/types";

interface AgentBuilderInstructionsContextType {
  generationSettings: GenerationSettingsType;
  setGenerationSettings: React.Dispatch<
    React.SetStateAction<GenerationSettingsType>
  >;
  models: ModelConfigurationType[];
  instructions: string;
  setInstructions: React.Dispatch<React.SetStateAction<string>>;
}

const AgentBuilderInstructionsContext = createContext<
  AgentBuilderInstructionsContextType | undefined
>(undefined);

interface AgentBuilderInstructionsProviderProps {
  children: React.ReactNode;
}

export function AgentBuilderInstructionsProvider({
  children,
}: AgentBuilderInstructionsProviderProps) {
  const { owner } = useAgentBuilderContext();
  const { models } = useModels({ owner });

  const [generationSettings, setGenerationSettings] =
    useState<GenerationSettingsType>({
      modelSettings: {
        modelId: GPT_4O_MODEL_ID,
        providerId: "openai",
      },
      temperature: 0.7,
    });

  const [instructions, setInstructions] = useState<string>("");

  const handleSetGenerationSettings = useCallback(
    (settings: React.SetStateAction<GenerationSettingsType>) => {
      setGenerationSettings((prevSettings) => {
        const newSettings =
          typeof settings === "function" ? settings(prevSettings) : settings;
        return {
          ...newSettings,
          responseFormat: isSupportingResponseFormat(
            newSettings.modelSettings.modelId
          )
            ? newSettings.responseFormat
            : undefined,
        };
      });
    },
    []
  );

  const contextValue = useMemo(
    () => ({
      generationSettings,
      setGenerationSettings: handleSetGenerationSettings,
      models,
      instructions,
      setInstructions,
    }),
    [generationSettings, handleSetGenerationSettings, models, instructions]
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
