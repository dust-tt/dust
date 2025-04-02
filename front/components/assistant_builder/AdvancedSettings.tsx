import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Popover,
  ScrollArea,
  ScrollBar,
} from "@dust-tt/sparkle";
import React from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { classNames } from "@app/lib/utils";
import type {
  AssistantCreativityLevel,
  ModelConfigurationType,
  ModelIdType,
  SupportedModel,
} from "@app/types";
import {
  ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES,
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES,
  CLAUDE_3_7_SONNET_20250219_MODEL_ID,
  GPT_4O_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
} from "@app/types";

const BEST_PERFORMING_MODELS_ID: ModelIdType[] = [
  GPT_4O_MODEL_ID,
  CLAUDE_3_7_SONNET_20250219_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
] as const;

export const CREATIVITY_LEVELS = Object.entries(
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES
).map(([k, v]) => ({
  label:
    ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES[k as AssistantCreativityLevel],
  value: v,
}));

function isBestPerformingModel(modelId: ModelIdType) {
  return BEST_PERFORMING_MODELS_ID.includes(modelId);
}

const getCreativityLevelFromTemperature = (temperature: number) => {
  const closest = CREATIVITY_LEVELS.reduce((prev, curr) =>
    Math.abs(curr.value - temperature) < Math.abs(prev.value - temperature)
      ? curr
      : prev
  );
  return closest;
};

export function AdvancedSettings({
  generationSettings,
  setGenerationSettings,
  models,
}: {
  generationSettings: AssistantBuilderState["generationSettings"];
  setGenerationSettings: (
    generationSettingsSettings: AssistantBuilderState["generationSettings"]
  ) => void;
  models: ModelConfigurationType[];
}) {
  if (!models) {
    return null;
  }

  const supportedModelConfig = getSupportedModelConfig(
    generationSettings.modelSettings
  );
  if (!supportedModelConfig) {
    // unreachable
    alert("Unsupported model");
  }

  const bestPerformingModelConfigs: ModelConfigurationType[] = [];
  const otherModelConfigs: ModelConfigurationType[] = [];
  for (const modelConfig of models) {
    if (isBestPerformingModel(modelConfig.modelId)) {
      bestPerformingModelConfigs.push(modelConfig);
    } else {
      otherModelConfigs.push(modelConfig);
    }
  }

  return (
    <Popover
      popoverTriggerAsChild
      trigger={
        <Button
          label="Advanced settings"
          variant="outline"
          size="sm"
          isSelect
        />
      }
      content={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-end gap-2">
            <div
              className={classNames(
                "w-full grow text-sm font-bold",
                "text-muted-foreground dark:text-muted-foreground-night"
              )}
            >
              Model selection
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  isSelect
                  label={
                    getSupportedModelConfig(generationSettings.modelSettings)
                      .displayName
                  }
                  variant="outline"
                  size="sm"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel label="Best performing models" />
                <ScrollArea className="flex max-h-72 flex-col" hideScrollBar>
                  <ModelList
                    modelConfigs={bestPerformingModelConfigs}
                    onClick={(modelSettings) => {
                      setGenerationSettings({
                        ...generationSettings,
                        modelSettings,
                      });
                    }}
                  />
                  <DropdownMenuLabel label="Other models" />
                  <ModelList
                    modelConfigs={otherModelConfigs}
                    onClick={(modelSettings) => {
                      setGenerationSettings({
                        ...generationSettings,
                        modelSettings,
                      });
                    }}
                  />
                  <ScrollBar className="py-0" />
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div
              className={classNames(
                "w-full grow text-sm font-bold",
                "text-muted-foreground dark:text-muted-foreground-night"
              )}
            >
              Creativity level
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  isSelect
                  label={
                    getCreativityLevelFromTemperature(
                      generationSettings?.temperature
                    ).label
                  }
                  variant="outline"
                  size="sm"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {CREATIVITY_LEVELS.map(({ label, value }) => (
                  <DropdownMenuItem
                    key={label}
                    label={label}
                    onClick={() => {
                      setGenerationSettings({
                        ...generationSettings,
                        temperature: value,
                      });
                    }}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      }
    />
  );
}

interface ModelListProps {
  modelConfigs: ModelConfigurationType[];
  onClick: (modelSettings: SupportedModel) => void;
}

function ModelList({ modelConfigs, onClick }: ModelListProps) {
  const { isDark } = useTheme();
  const handleClick = (modelConfig: ModelConfigurationType) => {
    onClick({
      modelId: modelConfig.modelId,
      providerId: modelConfig.providerId,
      reasoningEffort: modelConfig.reasoningEffort,
    });
  };

  return (
    <>
      {modelConfigs.map((modelConfig) => (
        <DropdownMenuItem
          key={`${modelConfig.modelId}${modelConfig.reasoningEffort ? `-${modelConfig.reasoningEffort}` : ""}`}
          icon={getModelProviderLogo(modelConfig.providerId, isDark)}
          description={modelConfig.shortDescription}
          label={modelConfig.displayName}
          onClick={() => handleClick(modelConfig)}
        />
      ))}
    </>
  );
}
