import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import React from "react";
import { useController } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  categorizeModels,
  getModelKey,
} from "@app/components/agent_builder/instructions/utils";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ModelConfigurationType } from "@app/types";

interface ModelSelectionSubmenuProps {
  models: ModelConfigurationType[];
}

interface ModelRadioItemProps {
  modelConfig: ModelConfigurationType;
  isDark: boolean;
  onModelSelection: (modelConfig: ModelConfigurationType) => void;
}

function ModelRadioItem({
  modelConfig,
  isDark,
  onModelSelection,
}: ModelRadioItemProps) {
  return (
    <DropdownMenuRadioItem
      value={modelConfig.modelId}
      icon={getModelProviderLogo(modelConfig.providerId, isDark)}
      description={modelConfig.shortDescription}
      label={modelConfig.displayName}
      onClick={() => onModelSelection(modelConfig)}
    />
  );
}

export function ModelSelectionSubmenu({ models }: ModelSelectionSubmenuProps) {
  const { isDark } = useTheme();
  const { field: modelField } = useController<
    AgentBuilderFormData,
    "generationSettings.modelSettings"
  >({
    name: "generationSettings.modelSettings",
  });
  const { field: reasoningEffortField } = useController<
    AgentBuilderFormData,
    "generationSettings.reasoningEffort"
  >({
    name: "generationSettings.reasoningEffort",
  });
  const { bestPerformingModelConfigs, otherModelConfigs } =
    categorizeModels(models);

  const currentModelKey = modelField.value.modelId;

  const handleModelSelection = (modelConfig: ModelConfigurationType) => {
    modelField.onChange({
      modelId: modelConfig.modelId,
      providerId: modelConfig.providerId,
    });
    // Set reasoning effort to the model's default
    reasoningEffortField.onChange(modelConfig.defaultReasoningEffort);
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Model selection" />
      <DropdownMenuSubContent className="w-80">
        <DropdownMenuLabel label="Best performing models" />
        <DropdownMenuRadioGroup value={currentModelKey}>
          {bestPerformingModelConfigs.map((modelConfig) => {
            return (
              <ModelRadioItem
                key={getModelKey(modelConfig)}
                modelConfig={modelConfig}
                isDark={isDark}
                onModelSelection={handleModelSelection}
              />
            );
          })}
        </DropdownMenuRadioGroup>

        <DropdownMenuLabel label="Other models" />
        <DropdownMenuRadioGroup value={currentModelKey}>
          {otherModelConfigs.map((modelConfig) => {
            return (
              <ModelRadioItem
                key={getModelKey(modelConfig)}
                modelConfig={modelConfig}
                isDark={isDark}
                onModelSelection={handleModelSelection}
              />
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
