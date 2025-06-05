import React from "react";

import { AdvancedSettings } from "@app/components/agent_builder/instructions/AdvancedSettings";
import { useAgentBuilderInstructions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsContext";

export function AgentBuilderInstructionsBlock() {
  const { generationSettings, setGenerationSettings, models } =
    useAgentBuilderInstructions();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center justify-between sm:flex-row">
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Command or guideline you provide to your agent to direct its
          responses.
        </span>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex items-center gap-2">
            <AdvancedSettings
              generationSettings={generationSettings}
              setGenerationSettings={setGenerationSettings}
              models={models}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
