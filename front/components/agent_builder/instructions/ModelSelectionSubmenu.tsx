import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  getModelKey,
  getModelsCategorization,
} from "@app/components/agent_builder/instructions/utils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { RegionalFlag } from "@app/components/shared/RegionalFlag";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import {
  Check,
  ChevronDown,
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
} from "@dust-tt/sparkle";
import type React from "react";
import { Fragment, useState } from "react";
import { useController } from "react-hook-form";

interface ModelSelectionSubmenuProps {
  models: EnabledModelConfigurationType[];
}

const NOT_SELECTABLE_MODEL_DESCRIPTION =
  "Not enabled for you. Choose another model to save.";

const KILLED_MODEL_DESCRIPTION = "Temporarily down. Choose another model.";

function getModelDescription(
  modelConfig: EnabledModelConfigurationType,
  isSelected: boolean
): string | undefined {
  if (modelConfig.isSelectable || !isSelected) {
    return modelConfig.shortDescription;
  }

  return modelConfig.isKilled
    ? KILLED_MODEL_DESCRIPTION
    : NOT_SELECTABLE_MODEL_DESCRIPTION;
}

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
      icon={getModelMakerLogo(getModelMaker(modelConfig), isDark)}
      description={getModelDescription(modelConfig, isSelected)}
      label={modelConfig.displayName}
      disabled={!modelConfig.isSelectable}
      onSelect={(e) => {
        // Keep the dropdown open after picking a model so the user can adjust
        // reasoning effort or other settings without reopening it.
        e.preventDefault();
      }}
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

  // On mobile there is no room for flyout submenus, so "Custom model" and each
  // maker group expand inline within the same dropdown instead.
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedMaker, setExpandedMaker] = useState<ModelMakerIdType | null>(
    null
  );

  const showRegionalFlag =
    hasFeature("use_vertex_for_supported_models") && !subscription.plan.isByok;

  const { bestGeneralModels, makerGroups } = getModelsCategorization(models);

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

  const regionalComponentFor = (modelConfig: EnabledModelConfigurationType) =>
    modelConfig.regionalAvailability[regionInfo.name] && showRegionalFlag ? (
      <RegionalFlag region={regionInfo.name} />
    ) : null;

  const renderRadioItem = (
    modelConfig: EnabledModelConfigurationType,
    isSelected: boolean
  ) => (
    <ModelRadioItem
      key={getModelKey(modelConfig)}
      modelConfig={modelConfig}
      isDark={isDark}
      isSelected={isSelected}
      onModelSelection={handleModelSelection}
      regionalComponent={regionalComponentFor(modelConfig)}
    />
  );

  const selectedModelSection = showSelectedModelSection && selectedModel && (
    <>
      <DropdownMenuLabel label="Selected model" />
      <DropdownMenuRadioGroup value={currentModelKey}>
        {renderRadioItem(selectedModel, true)}
      </DropdownMenuRadioGroup>
    </>
  );

  const bestModelsSection = (
    <>
      <DropdownMenuLabel label="Best performing models by providers" />
      <DropdownMenuRadioGroup value={currentModelKey}>
        {bestGeneralModels.map((modelConfig) =>
          renderRadioItem(modelConfig, isModelSelected(modelConfig))
        )}
      </DropdownMenuRadioGroup>
    </>
  );

  const renderMakerModels = (models: {
    recent: EnabledModelConfigurationType[];
    older: EnabledModelConfigurationType[];
  }) => {
    const hasRecentModels = models.recent.length > 0;
    const hasOlderModels = models.older.length > 0;
    return (
      <>
        {hasRecentModels && (
          <>
            <DropdownMenuLabel label="Recent models" />
            <DropdownMenuRadioGroup value={currentModelKey}>
              {models.recent.map((modelConfig) =>
                renderRadioItem(modelConfig, isModelSelected(modelConfig))
              )}
            </DropdownMenuRadioGroup>
          </>
        )}
        {hasOlderModels && (
          <>
            <DropdownMenuLabel
              label={hasRecentModels ? "Older models" : "All models"}
            />
            <DropdownMenuRadioGroup value={currentModelKey}>
              {models.older.map((modelConfig) =>
                renderRadioItem(modelConfig, isModelSelected(modelConfig))
              )}
            </DropdownMenuRadioGroup>
          </>
        )}
      </>
    );
  };

  const selectedModelMaker = selectedModel
    ? getModelMaker(selectedModel)
    : null;

  if (isMobile) {
    return (
      <>
        <DropdownMenuItem
          label="Custom model"
          endComponent={
            <Icon visual={isExpanded ? ChevronDown : ChevronRight} size="xs" />
          }
          onClick={() => setIsExpanded((v) => !v)}
          onSelect={(e) => e.preventDefault()}
        />
        {isExpanded && (
          <>
            {selectedModelSection}
            {bestModelsSection}
            <DropdownMenuLabel label="Other models" />
            {Array.from(makerGroups.entries()).map(([makerId, models]) => (
              <Fragment key={makerId}>
                <DropdownMenuItem
                  label={`From ${getModelMakerDisplayName(makerId)}`}
                  endComponent={
                    <div className="flex items-center gap-1">
                      {selectedModelMaker === makerId && (
                        <Icon
                          visual={Check}
                          size="sm"
                          className="text-muted-foreground"
                        />
                      )}
                      <Icon
                        visual={
                          expandedMaker === makerId ? ChevronDown : ChevronRight
                        }
                        size="xs"
                      />
                    </div>
                  }
                  onClick={() =>
                    setExpandedMaker((current) =>
                      current === makerId ? null : makerId
                    )
                  }
                  onSelect={(e) => e.preventDefault()}
                />
                {expandedMaker === makerId && renderMakerModels(models)}
              </Fragment>
            ))}
          </>
        )}
      </>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Custom model" />
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-80">
          {selectedModelSection}
          {bestModelsSection}
          <DropdownMenuLabel label="Other models" />
          {Array.from(makerGroups.entries()).map(([makerId, models]) => (
            <DropdownMenuSub key={makerId}>
              <DropdownMenuSubTrigger
                label={`From ${getModelMakerDisplayName(makerId)}`}
              />
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-80">
                  {renderMakerModels(models)}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
