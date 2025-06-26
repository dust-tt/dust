import { Page } from "@dust-tt/sparkle";
import React from "react";

import { AdvancedSettings } from "@app/components/agent_builder/instructions/AdvancedSettings";
import { useAgentBuilderInstructionsContext } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsContext";
import { AgentBuilderInstructionsEditor } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";

export function AgentBuilderInstructionsBlock() {
  const { generationSettings, setGenerationSettings, models } =
    useAgentBuilderInstructionsContext();

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
              generationSettings={generationSettings}
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
