import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import dynamic from "next/dynamic";
import React from "react";

import { ReasoningEffortSubmenu } from "@app/components/assistant_builder/instructions/ReasoningEffortSubmenu";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type {
  AssistantCreativityLevel,
  ModelConfigurationType,
  ModelIdType,
} from "@app/types";
import {
  ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES,
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GPT_4O_MODEL_ID,
  isSupportingResponseFormat,
  MISTRAL_LARGE_MODEL_ID,
} from "@app/types";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

const BEST_PERFORMING_MODELS_ID: ModelIdType[] = [
  GPT_4O_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
] as const;

const CREATIVITY_LEVELS = Object.entries(
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES
).map(([k, v]) => ({
  label:
    ASSISTANT_CREATIVITY_LEVEL_DISPLAY_NAMES[k as AssistantCreativityLevel],
  value: v,
}));

function isBestPerformingModel(modelId: ModelIdType) {
  return BEST_PERFORMING_MODELS_ID.includes(modelId);
}

const isInvalidJson = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  try {
    const parsed = JSON.parse(value);
    return !parsed || typeof parsed !== "object";
  } catch {
    return true;
  }
};

interface AdvancedSettingsProps {
  generationSettings: AssistantBuilderState["generationSettings"];
  setGenerationSettings: (
    generationSettingsSettings: AssistantBuilderState["generationSettings"]
  ) => void;
  models: ModelConfigurationType[];
}

export function AdvancedSettings({
  generationSettings,
  setGenerationSettings,
  models,
}: AdvancedSettingsProps) {
  const { isDark } = useTheme();
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

  const supportsResponseFormat = isSupportingResponseFormat(
    generationSettings.modelSettings.modelId
  );
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
        {/* Model Selection */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Model selection" />
          <DropdownMenuSubContent className="w-80">
            <DropdownMenuLabel label="Best performing models" />
            <DropdownMenuRadioGroup
              value={generationSettings.modelSettings.modelId}
            >
              {bestPerformingModelConfigs.map((modelConfig) => (
                <DropdownMenuRadioItem
                  key={modelConfig.modelId}
                  value={modelConfig.modelId}
                  icon={getModelProviderLogo(modelConfig.providerId, isDark)}
                  description={modelConfig.shortDescription}
                  label={modelConfig.displayName}
                  onClick={() => {
                    setGenerationSettings({
                      ...generationSettings,
                      modelSettings: {
                        modelId: modelConfig.modelId,
                        providerId: modelConfig.providerId,
                      },
                      reasoningEffort: modelConfig.defaultReasoningEffort,
                    });
                  }}
                />
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuLabel label="Other models" />
            <DropdownMenuRadioGroup
              value={generationSettings.modelSettings.modelId}
            >
              {otherModelConfigs.map((modelConfig) => (
                <DropdownMenuRadioItem
                  key={modelConfig.modelId}
                  value={modelConfig.modelId}
                  icon={getModelProviderLogo(modelConfig.providerId, isDark)}
                  description={modelConfig.shortDescription}
                  label={modelConfig.displayName}
                  onClick={() => {
                    setGenerationSettings({
                      ...generationSettings,
                      modelSettings: {
                        modelId: modelConfig.modelId,
                        providerId: modelConfig.providerId,
                      },
                      reasoningEffort: modelConfig.defaultReasoningEffort,
                    });
                  }}
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Creativity Level */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Creativity level" />
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={generationSettings?.temperature.toString()}
            >
              {CREATIVITY_LEVELS.map(({ label, value }) => (
                <DropdownMenuRadioItem
                  key={value}
                  value={value.toString()}
                  label={label}
                  onClick={() => {
                    setGenerationSettings({
                      ...generationSettings,
                      temperature: value,
                    });
                  }}
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <ReasoningEffortSubmenu
          generationSettings={generationSettings}
          setGenerationSettings={setGenerationSettings}
        />

        {supportsResponseFormat && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger label="Structured Response Format" />
            <DropdownMenuSubContent className="w-96">
              <CodeEditor
                data-color-mode={isDark ? "dark" : "light"}
                value={generationSettings?.responseFormat ?? ""}
                placeholder={
                  "Example:\n\n" +
                  "{\n" +
                  '  "type": "json_schema",\n' +
                  '  "json_schema": {\n' +
                  '    "name": "YourSchemaName",\n' +
                  '    "strict": true,\n' +
                  '    "schema": {\n' +
                  '      "type": "object",\n' +
                  '      "properties": {\n' +
                  '        "property1":\n' +
                  '          { "type":"string" }\n' +
                  "      },\n" +
                  '      "required": ["property1"],\n' +
                  '      "additionalProperties": false\n' +
                  "    }\n" +
                  "  }\n" +
                  "}"
                }
                name="responseFormat"
                onChange={(e) => {
                  setGenerationSettings({
                    ...generationSettings,
                    responseFormat: e.target.value,
                  });
                }}
                minHeight={380}
                className={cn(
                  "rounded-lg",
                  isInvalidJson(generationSettings?.responseFormat)
                    ? "border-2 border-red-500 bg-slate-100 dark:bg-slate-100-night"
                    : "bg-slate-100 dark:bg-slate-100-night"
                )}
                style={{
                  fontSize: 13,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                  overflowY: "auto",
                  height: "400px",
                }}
                language="json"
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
