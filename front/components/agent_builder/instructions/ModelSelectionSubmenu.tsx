import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import React from "react";

import {
  categorizeModels,
  getModelKey,
} from "@app/components/agent_builder/instructions/utils";
import type { GenerationSettingsType } from "@app/components/agent_builder/types";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ModelConfigurationType } from "@app/types";

interface ModelSelectionSubmenuProps {
  generationSettings: GenerationSettingsType;
  setGenerationSettings: (generationSettings: GenerationSettingsType) => void;
  models: ModelConfigurationType[];
}

interface ModelRadioItemProps {
  modelConfig: ModelConfigurationType;
  currentModelKey: string;
  isDark: boolean;
  onModelSelection: (modelConfig: ModelConfigurationType) => void;
}

function ModelRadioItem({
  modelConfig,
  currentModelKey,
  isDark,
  onModelSelection,
}: ModelRadioItemProps) {
  return (
    <DropdownMenuRadioItem
      value={currentModelKey}
      icon={getModelProviderLogo(modelConfig.providerId, isDark)}
      description={modelConfig.shortDescription}
      label={modelConfig.displayName}
      onClick={() => onModelSelection(modelConfig)}
    />
  );
}

export function ModelSelectionSubmenu({
  generationSettings,
  setGenerationSettings,
  models,
}: ModelSelectionSubmenuProps) {
  const { isDark } = useTheme();
  const { bestPerformingModelConfigs, otherModelConfigs } =
    categorizeModels(models);

  const currentModelKey = `${generationSettings.modelSettings.modelId}${generationSettings.modelSettings.reasoningEffort ? `-${generationSettings.modelSettings.reasoningEffort}` : ""}`;

  const handleModelSelection = (modelConfig: ModelConfigurationType) => {
    setGenerationSettings({
      ...generationSettings,
      modelSettings: {
        modelId: modelConfig.modelId,
        providerId: modelConfig.providerId,
        reasoningEffort: modelConfig.reasoningEffort,
      },
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Model selection" />
      <DropdownMenuSubContent className="w-80">
        <DropdownMenuLabel label="Best performing models" />
        <DropdownMenuRadioGroup value={currentModelKey}>
          {bestPerformingModelConfigs.map((modelConfig) => (
            <ModelRadioItem
              key={getModelKey(modelConfig)}
              modelConfig={modelConfig}
              currentModelKey={currentModelKey}
              isDark={isDark}
              onModelSelection={handleModelSelection}
            />
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuLabel label="Other models" />
        <DropdownMenuRadioGroup value={currentModelKey}>
          {otherModelConfigs.map((modelConfig) => (
            <ModelRadioItem
              key={getModelKey(modelConfig)}
              modelConfig={modelConfig}
              currentModelKey={currentModelKey}
              isDark={isDark}
              onModelSelection={handleModelSelection}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
