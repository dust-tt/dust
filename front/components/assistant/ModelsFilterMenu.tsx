import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import { MODEL_TIERS } from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import { removeNulls } from "@app/types/shared/utils/general";
import {
  Button,
  Check,
  ChevronRight,
  CpuChip01,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

export type AgentModelFilterType = {
  modelId: string;
  displayName: string;
};

interface ModelsFilterMenuProps {
  models: AgentModelFilterType[];
  selectedModels: AgentModelFilterType[];
  setSelectedModels: (models: AgentModelFilterType[]) => void;
  isCompact?: boolean;
}

interface AgentModelMakerGroup {
  makerId: ModelMakerIdType;
  models: AgentModelFilterType[];
}

interface ModelFilterItemProps {
  model: AgentModelFilterType;
  icon?: ComponentType;
  isSelected: boolean;
  onToggle: (model: AgentModelFilterType) => void;
}

function ModelFilterItem({
  model,
  icon,
  isSelected,
  onToggle,
}: ModelFilterItemProps) {
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={isSelected}
      label={model.displayName}
      icon={icon}
      truncateText
      endComponent={
        isSelected ? (
          <Icon visual={Check} size="sm" className="text-muted-foreground" />
        ) : undefined
      }
      onSelect={(event) => {
        event.preventDefault();
        onToggle(model);
      }}
    />
  );
}

export function ModelsFilterMenu({
  models,
  selectedModels,
  setSelectedModels,
  isCompact = false,
}: ModelsFilterMenuProps) {
  const { isDark } = useTheme();
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  const selectedModelIds = new Set(
    selectedModels.map((model) => model.modelId)
  );
  const modelsById = new Map(models.map((model) => [model.modelId, model]));

  const tierModels = removeNulls(
    MODEL_TIERS.map((tier) => {
      const model = modelsById.get(tier.metaModelId);
      return model
        ? { ...model, displayName: tier.name, tierId: tier.id }
        : null;
    })
  );

  // Use the same model order and maker metadata as the Composer picker, while
  // only showing models that are used by agents in this workspace.
  const knownModelIds = new Set<string>();
  const modelsByMaker = new Map<ModelMakerIdType, AgentModelFilterType[]>();
  for (const modelConfig of getSupportedModelConfigs()) {
    const model = modelsById.get(modelConfig.modelId);
    if (
      model &&
      !isModelStreamId(model.modelId) &&
      !knownModelIds.has(model.modelId)
    ) {
      knownModelIds.add(model.modelId);
      const makerId = getModelMaker(modelConfig);
      const makerModels = modelsByMaker.get(makerId);
      if (makerModels) {
        makerModels.push(model);
      } else {
        modelsByMaker.set(makerId, [model]);
      }
    }
  }

  const makerGroups: AgentModelMakerGroup[] = Array.from(
    modelsByMaker.entries(),
    ([makerId, makerModels]) => ({ makerId, models: makerModels })
  );
  const makerByModelId = new Map<string, ModelMakerIdType>(
    makerGroups.flatMap((group) =>
      group.models.map((model) => [model.modelId, group.makerId] as const)
    )
  );
  const unknownModels = models.filter(
    (model) =>
      !isModelStreamId(model.modelId) && !knownModelIds.has(model.modelId)
  );
  const concreteModels = [
    ...makerGroups.flatMap((group) => group.models),
    ...unknownModels,
  ];

  const query = modelSearch.trim().toLowerCase();
  const isSearching = query !== "";
  const searchResults = isSearching
    ? concreteModels.filter((model) => {
        const makerId = makerByModelId.get(model.modelId);
        return (
          model.displayName.toLowerCase().includes(query) ||
          (makerId !== undefined &&
            getModelMakerDisplayName(makerId).toLowerCase().includes(query))
        );
      })
    : [];

  const toggleModel = (model: AgentModelFilterType) => {
    setSelectedModels(
      selectedModelIds.has(model.modelId)
        ? selectedModels.filter(
            (selected) => selected.modelId !== model.modelId
          )
        : [...selectedModels, model]
    );
  };

  const hasSelectedConcreteModel = concreteModels.some((model) =>
    selectedModelIds.has(model.modelId)
  );

  const moreModels = (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger onClick={(event) => event.stopPropagation()}>
        <span className="grow truncate text-left">More models</span>
        {hasSelectedConcreteModel && (
          <Icon visual={Check} size="sm" className="text-muted-foreground" />
        )}
        <Icon
          visual={ChevronRight}
          size="xs"
          className="text-muted-foreground"
        />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="max-h-112 w-64 overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-overlay-background">
          <DropdownMenuSearchbar
            autoFocus={!isCompact}
            name="search-models"
            placeholder="Search for model"
            value={modelSearch}
            onChange={setModelSearch}
          />
        </div>
        {isSearching ? (
          searchResults.length > 0 ? (
            searchResults.map((model) => (
              <ModelFilterItem
                key={model.modelId}
                model={model}
                isSelected={selectedModelIds.has(model.modelId)}
                onToggle={toggleModel}
              />
            ))
          ) : (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              No models found
            </div>
          )
        ) : (
          <>
            {makerGroups.map((maker) => (
              <DropdownMenuSub key={maker.makerId}>
                <DropdownMenuSubTrigger>
                  <Icon
                    visual={getModelMakerLogo(maker.makerId, isDark)}
                    size="sm"
                  />
                  <span className="grow truncate text-left">
                    {getModelMakerDisplayName(maker.makerId)}
                  </span>
                  {maker.models.some((model) =>
                    selectedModelIds.has(model.modelId)
                  ) && (
                    <Icon
                      visual={Check}
                      size="sm"
                      className="text-muted-foreground"
                    />
                  )}
                  <Icon
                    visual={ChevronRight}
                    size="xs"
                    className="text-muted-foreground"
                  />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  className="max-h-96 w-64 overflow-y-auto"
                  onClick={(event) => event.stopPropagation()}
                >
                  {maker.models.map((model) => (
                    <ModelFilterItem
                      key={model.modelId}
                      model={model}
                      isSelected={selectedModelIds.has(model.modelId)}
                      onToggle={toggleModel}
                    />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
            {unknownModels.length > 0 && (
              <>
                <DropdownMenuLabel label="Other models" />
                {unknownModels.map((model) => (
                  <ModelFilterItem
                    key={model.modelId}
                    model={model}
                    isSelected={selectedModelIds.has(model.modelId)}
                    onToggle={toggleModel}
                  />
                ))}
              </>
            )}
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  return (
    <DropdownMenu
      open={isDropdownOpen}
      onOpenChange={(open) => {
        setDropdownOpen(open);
        if (!open) {
          setModelSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={CpuChip01}
          label={isCompact ? undefined : "Models"}
          tooltip={isCompact ? "Models" : undefined}
          counterValue={selectedModels.length.toString()}
          isCounter={selectedModels.length > 0}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-84" align="start">
        {models.length > 0 ? (
          <>
            <DropdownMenuLabel label="Model" />
            {tierModels.map((model) => (
              <ModelFilterItem
                key={model.modelId}
                model={model}
                icon={MODEL_TIER_ICON[model.tierId]}
                isSelected={selectedModelIds.has(model.modelId)}
                onToggle={toggleModel}
              />
            ))}
            {tierModels.length > 0 && concreteModels.length > 0 && (
              <DropdownMenuSeparator />
            )}
            {concreteModels.length > 0 && moreModels}
          </>
        ) : (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            No models found
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
