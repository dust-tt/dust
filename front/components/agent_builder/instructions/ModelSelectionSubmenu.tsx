import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  getModelKey,
  getModelsCategorization,
} from "@app/components/agent_builder/instructions/utils";
import { getModelProviderLogo } from "@app/components/providers/types";
import { RegionalFlag } from "@app/components/shared/RegionalFlag";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { RegionType } from "@app/lib/api/regions/config";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import { getProviderDisplayName } from "@app/types/assistant/models/providers";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import {
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import type React from "react";
import { useController } from "react-hook-form";

interface ModelSelectionSubmenuProps {
  models: ModelConfigurationType[];
}

interface ModelRadioItemProps {
  modelConfig: ModelConfigurationType;
  isDark: boolean;
  onModelSelection: (modelConfig: ModelConfigurationType) => void;
  endComponent?: React.ReactNode | null;
}

function ModelRadioItem({
  modelConfig,
  isDark,
  onModelSelection,
  endComponent,
}: ModelRadioItemProps) {
  return (
    <DropdownMenuRadioItem
      value={modelConfig.modelId}
      icon={getModelProviderLogo(modelConfig.providerId, isDark)}
      description={modelConfig.shortDescription}
      label={modelConfig.displayName}
      onClick={() => onModelSelection(modelConfig)}
      endComponent={endComponent}
    />
  );
}

const SHOULD_DISPLAY_FLAG: Record<RegionType, boolean> = {
  "europe-west1": true,
  "us-central1": false,
};

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

  const { regionInfo } = useRegionContext();
  const { hasFeature } = useFeatureFlags();

  const showRegionalFlag =
    hasFeature("use_vertex_for_anthropic_models") &&
    SHOULD_DISPLAY_FLAG[regionInfo.name];

  const modelRadioItemEndComponent = showRegionalFlag ? (
    <RegionalFlag region={regionInfo.name} />
  ) : null;

  const { bestGeneralModels, providerGroups } = getModelsCategorization(models);

  const currentModelKey = modelField.value.modelId;

  const selectedModel = models.find(
    (model) => model.modelId === currentModelKey
  );

  const isSelectedModelNotInBest =
    selectedModel &&
    !bestGeneralModels.some((model) => model.modelId === selectedModel.modelId);

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
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-80">
          {isSelectedModelNotInBest && selectedModel && (
            <>
              <DropdownMenuLabel label="Selected model" />
              <DropdownMenuRadioGroup value={currentModelKey}>
                <ModelRadioItem
                  key={getModelKey(selectedModel)}
                  modelConfig={selectedModel}
                  isDark={isDark}
                  onModelSelection={handleModelSelection}
                  endComponent={
                    selectedModel.regionalAvailability[regionInfo.name]
                      ? modelRadioItemEndComponent
                      : null
                  }
                />
              </DropdownMenuRadioGroup>
            </>
          )}

          <DropdownMenuLabel label="Best performing models by providers" />
          <DropdownMenuRadioGroup value={currentModelKey}>
            {bestGeneralModels.map((modelConfig) => (
              <ModelRadioItem
                key={getModelKey(modelConfig)}
                modelConfig={modelConfig}
                isDark={isDark}
                onModelSelection={handleModelSelection}
                endComponent={
                  modelConfig.regionalAvailability[regionInfo.name]
                    ? modelRadioItemEndComponent
                    : null
                }
              />
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuLabel label="Other models" />
          {Array.from(providerGroups.entries()).map(([providerId, models]) => {
            const providerDisplayName = getProviderDisplayName(providerId);
            const hasRecentModels = models.recent.length > 0;
            const hasOlderModels = models.older.length > 0;

            return (
              <DropdownMenuSub key={providerId}>
                <DropdownMenuSubTrigger label={`From ${providerDisplayName}`} />
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-80">
                    {hasRecentModels && (
                      <>
                        <DropdownMenuLabel label="Recent models" />
                        <DropdownMenuRadioGroup value={currentModelKey}>
                          {models.recent.map((modelConfig) => (
                            <ModelRadioItem
                              key={getModelKey(modelConfig)}
                              modelConfig={modelConfig}
                              isDark={isDark}
                              onModelSelection={handleModelSelection}
                              endComponent={
                                modelConfig.regionalAvailability[
                                  regionInfo.name
                                ]
                                  ? modelRadioItemEndComponent
                                  : null
                              }
                            />
                          ))}
                        </DropdownMenuRadioGroup>
                      </>
                    )}
                    {hasOlderModels && (
                      <>
                        <DropdownMenuLabel
                          label={
                            hasRecentModels ? "Older models" : "All models"
                          }
                        />
                        <DropdownMenuRadioGroup value={currentModelKey}>
                          {models.older.map((modelConfig) => (
                            <ModelRadioItem
                              key={getModelKey(modelConfig)}
                              modelConfig={modelConfig}
                              isDark={isDark}
                              onModelSelection={handleModelSelection}
                              endComponent={
                                modelConfig.regionalAvailability[
                                  regionInfo.name
                                ]
                                  ? modelRadioItemEndComponent
                                  : null
                              }
                            />
                          ))}
                        </DropdownMenuRadioGroup>
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
