import { Page } from "@dust-tt/sparkle";
import React from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderFormData,
  AgentBuilderGenerationSettings,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AdvancedSettings } from "@app/components/agent_builder/instructions/AdvancedSettings";
import { AgentBuilderInstructionsEditor } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import type { GenerationSettingsType } from "@app/components/agent_builder/types";
import { useModels } from "@app/lib/swr/models";

export function AgentBuilderInstructionsBlock() {
  const form = useFormContext<AgentBuilderFormData>();
  const { owner } = useAgentBuilderContext();
  const { models } = useModels({ owner });
  const generationSettings = form.watch("generationSettings");

  const setGenerationSettings = (newSettings: GenerationSettingsType) => {
    // Convert GenerationSettingsType to AgentBuilderGenerationSettings
    const builderSettings: AgentBuilderGenerationSettings = {
      modelSettings: {
        modelId: newSettings.modelSettings.modelId,
        providerId: newSettings.modelSettings.providerId,
      },
      temperature: newSettings.temperature,
      responseFormat: newSettings.responseFormat,
    };
    form.setValue("generationSettings", builderSettings);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <Page.H>Instructions</Page.H>
      <div className="flex flex-col items-center justify-between sm:flex-row">
        <Page.P>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Command or guideline you provide to your agent to direct its
            responses.
          </span>
        </Page.P>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex items-center gap-2">
            <AdvancedSettings
              generationSettings={{
                modelSettings: {
                  modelId: generationSettings.modelSettings.modelId,
                  providerId: generationSettings.modelSettings.providerId,
                },
                temperature: generationSettings.temperature,
                responseFormat: generationSettings.responseFormat,
              }}
              setGenerationSettings={setGenerationSettings}
              models={models}
            />
          </div>
        </div>
      </div>
      <AgentBuilderInstructionsEditor />
    </div>
  );
}
