import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  getModelKey,
  getModelsCategorization,
} from "@app/components/agent_builder/instructions/utils";
import { getModelProviderLogo } from "@app/components/providers/types";
import { RegionalFlag } from "@app/components/shared/RegionalFlag";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import { getProviderDisplayName } from "@app/types/assistant/models/providers";
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
  models: EnabledModelConfigurationType[];
}

const NOT_SELECTABLE_MODEL_DESCRIPTION =
  "Not enabled for you. Choose another model to save.";

interface ModelRadioItemProps {
  modelConfig: EnabledModelConfigurationType;
  isDark: boolean;
  isSelected: boolean;
  onModelSelection: (modelConfig: EnabledModelConfigurationType) => void;
  regionalComponent?: React.ReactNode | null;
}

function ModelRadioItem({
  modelConfig,
  isDark,
  isSelected,
  onModelSelection,
  regionalComponent,
}: ModelRadioItemProps) {
  return (
    <DropdownMenuRadioItem
      value={modelConfig.modelId}
      icon={getModelProviderLogo(modelConfig.providerId, isDark)}
      description={
        !modelConfig.isSelectable && isSelected
          ? NOT_SELECTABLE_MODEL_DESCRIPTION
          : modelConfig.shortDescription
      }
      label={modelConfig.displayName}
      disabled={!modelConfig.isSelectable}
      onClick={() => {
        onModelSelection(modelConfig);
      }}
      endComponent={regionalComponent}
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

  const { regionInfo } = useRegionContext();
  const { hasFeature } = useFeatureFlags();
  const { subscription } = useAuth();

  const showRegionalFlag =
    hasFeature("use_vertex_for_supported_models") && !subscription.plan.isByok;

  const { bestGeneralModels, providerGroups } = getModelsCategorization(models);

  const currentModelKey = modelField.value?.modelId;

  const selectedModel = models.find(
    (model) =>
      model.modelId === modelField.value?.modelId &&
      model.providerId === modelField.value?.providerId
  );

  const isSelectedModelNotInBest =
    selectedModel &&
    !bestGeneralModels.some((model) => model.modelId === selectedModel.modelId);

  const showSelectedModelSection =
    selectedModel && (!selectedModel.isSelectable || isSelectedModelNotInBest);

  const handleModelSelection = (modelConfig: EnabledModelConfigurationType) => {
    if (!modelConfig.isSelectable) {
      return;
    }

    modelField.onChange({
      modelId: modelConfig.modelId,
      providerId: modelConfig.providerId,
    });
    // Set reasoning effort to the model's default
    reasoningEffortField.onChange(modelConfig.defaultReasoningEffort);
  };

  const isModelSelected = (modelConfig: EnabledModelConfigurationType) =>
    modelConfig.modelId === modelField.value?.modelId &&
    modelConfig.providerId === modelField.value?.providerId;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Model selection" />
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-80">
          {showSelectedModelSection && selectedModel && (
            <>
              <DropdownMenuLabel label="Selected model" />
              <DropdownMenuRadioGroup value={currentModelKey}>
                <ModelRadioItem
                  key={getModelKey(selectedModel)}
                  modelConfig={selectedModel}
                  isDark={isDark}
                  isSelected={true}
                  onModelSelection={handleModelSelection}
                  regionalComponent={
                    selectedModel.regionalAvailability[regionInfo.name] &&
                    showRegionalFlag ? (
                      <RegionalFlag region={regionInfo.name} />
                    ) : null
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
                isSelected={isModelSelected(modelConfig)}
                onModelSelection={handleModelSelection}
                regionalComponent={
                  modelConfig.regionalAvailability[regionInfo.name] &&
                  showRegionalFlag ? (
                    <RegionalFlag region={regionInfo.name} />
                  ) : null
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
                              isSelected={isModelSelected(modelConfig)}
                              onModelSelection={handleModelSelection}
                              regionalComponent={
                                modelConfig.regionalAvailability[
                                  regionInfo.name
                                ] && showRegionalFlag ? (
                                  <RegionalFlag region={regionInfo.name} />
                                ) : null
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
                              isSelected={isModelSelected(modelConfig)}
                              onModelSelection={handleModelSelection}
                              regionalComponent={
                                modelConfig.regionalAvailability[
                                  regionInfo.name
                                ] && showRegionalFlag ? (
                                  <RegionalFlag region={regionInfo.name} />
                                ) : null
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
