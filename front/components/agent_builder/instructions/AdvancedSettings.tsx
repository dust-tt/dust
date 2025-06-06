import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import React from "react";

import { CreativityLevelSubmenu } from "@app/components/agent_builder/instructions/CreativityLevelSubmenu";
import { ModelSelectionSubmenu } from "@app/components/agent_builder/instructions/ModelSelectionSubmenu";
import { ResponseFormatSubmenu } from "@app/components/agent_builder/instructions/ResponseFormatSubmenu";
import type { GenerationSettingsType } from "@app/components/agent_builder/types";
import type { ModelConfigurationType } from "@app/types";
import { isSupportingResponseFormat } from "@app/types";

interface AdvancedSettingsProps {
  generationSettings: GenerationSettingsType;
  setGenerationSettings: (
    generationSettingsSettings: GenerationSettingsType
  ) => void;
  models: ModelConfigurationType[];
}

export function AdvancedSettings({
  generationSettings,
  setGenerationSettings,
  models,
}: AdvancedSettingsProps) {
  if (!models) {
    return null;
  }

  const supportsResponseFormat = isSupportingResponseFormat(
    generationSettings.modelSettings.modelId
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label="Advanced settings"
          variant="outline"
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ModelSelectionSubmenu
          generationSettings={generationSettings}
          setGenerationSettings={setGenerationSettings}
          models={models}
        />

        <CreativityLevelSubmenu
          generationSettings={generationSettings}
          setGenerationSettings={setGenerationSettings}
        />

        {supportsResponseFormat && (
          <ResponseFormatSubmenu
            generationSettings={generationSettings}
            setGenerationSettings={setGenerationSettings}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
