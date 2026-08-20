import type { ModelTierId } from "@app/components/model_picker/modelPickerUtils";
import {
  groupModelsByMaker,
  MODEL_TIERS,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
} from "@app/types/assistant/models/types";
import { removeNulls } from "@app/types/shared/utils/general";
import {
  BarFull,
  BarHalf,
  BarLow,
  Button,
  Check,
  ChevronDown,
  ChevronRight,
  CpuChip01,
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { Fragment, useState } from "react";

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

const TIER_ICON: Record<ModelTierId, ComponentType> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};

export function ModelsFilterMenu({
  models,
  selectedModels,
  setSelectedModels,
  isCompact = false,
}: ModelsFilterMenuProps) {
  const { isDark } = useTheme();
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [moreModelsExpanded, setMoreModelsExpanded] = useState(false);
  const [expandedMaker, setExpandedMaker] = useState<ModelMakerIdType | null>(
    null
  );

  const selectedModelIds = new Set(
    selectedModels.map((model) => model.modelId)
  );
  const modelsById = new Map(models.map((model) => [model.modelId, model]));

  const tierModels = removeNulls(MODEL_TIERS.map((tier) => {
    const model = modelsById.get(tier.metaModelId);
    return model ? { ...model, displayName: tier.name, tierId: tier.id } : null;
  }));
  // Keep the same model and maker ordering as the Composer picker, while only
  // showing models that are actually used by agents in this workspace.
  const knownModelIds = new Set<string>();
  const concreteModelConfigs: ModelConfigurationType[] = [];
  for (const model of getSupportedModelConfigs()) {
    if (
      modelsById.has(model.modelId) &&
      !isModelStreamId(model.modelId) &&
      !knownModelIds.has(model.modelId)
    ) {
      knownModelIds.add(model.modelId);
      concreteModelConfigs.push(model);
    }
  }
  const makerGroups = groupModelsByMaker(concreteModelConfigs).map((group) => ({
    makerId: group.makerId,
    models: removeNulls(
      group.models.map((model) => {
        const filterModel = modelsById.get(model.modelId);
        return filterModel ?? null;
      })
    ),
  }));
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

  const renderModel = (model: AgentModelFilterType, icon?: ComponentType) => {
    return (
      <DropdownMenuCheckboxItem
        key={model.modelId}
        label={model.displayName}
        icon={icon}
        truncateText
        checked={selectedModelIds.has(model.modelId)}
        onCheckedChange={() => toggleModel(model)}
        // Keep the menu open so several models can be toggled in a row.
        onSelect={(event) => event.preventDefault()}
      />
    );
  };

  const searchbar = (
    <div className="sticky top-0 z-10 bg-overlay-background">
      <DropdownMenuSearchbar
        autoFocus={!isCompact}
        name="search-models"
        placeholder="Search for model"
        value={modelSearch}
        onChange={setModelSearch}
      />
    </div>
  );

  const body = isSearching ? (
    searchResults.length > 0 ? (
      searchResults.map((model) => {
        const makerId = makerByModelId.get(model.modelId);
        return renderModel(
          model,
          makerId !== undefined ? getModelMakerLogo(makerId, isDark) : undefined
        );
      })
    ) : (
      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
        No models found
      </div>
    )
  ) : (
    <>
      {makerGroups.map((maker) =>
        isCompact ? (
          <Fragment key={maker.makerId}>
            <DropdownMenuItem
              label={getModelMakerDisplayName(maker.makerId)}
              icon={getModelMakerLogo(maker.makerId, isDark)}
              endComponent={
                <div className="flex items-center gap-1">
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
                    visual={
                      expandedMaker === maker.makerId
                        ? ChevronDown
                        : ChevronRight
                    }
                    size="xs"
                  />
                </div>
              }
              onClick={() =>
                setExpandedMaker(
                  expandedMaker === maker.makerId ? null : maker.makerId
                )
              }
              onSelect={(event) => event.preventDefault()}
            />
            {expandedMaker === maker.makerId &&
              maker.models.map((model) => renderModel(model))}
          </Fragment>
        ) : (
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
              {maker.models.map((model) => renderModel(model))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )
      )}
      {unknownModels.length > 0 && (
        <>
          <DropdownMenuLabel label="Other models" />
          {unknownModels.map((model) => renderModel(model))}
        </>
      )}
    </>
  );

  const hasSelectedConcreteModel = concreteModels.some((model) =>
    selectedModelIds.has(model.modelId)
  );

  const moreModels = isCompact ? (
    <>
      <DropdownMenuItem
        label="More models"
        endComponent={
          <div className="flex items-center gap-1">
            {hasSelectedConcreteModel && (
              <Icon
                visual={Check}
                size="sm"
                className="text-muted-foreground"
              />
            )}
            <Icon
              visual={moreModelsExpanded ? ChevronDown : ChevronRight}
              size="xs"
            />
          </div>
        }
        onClick={() => setMoreModelsExpanded((expanded) => !expanded)}
        onSelect={(event) => event.preventDefault()}
      />
      {moreModelsExpanded && (
        <>
          {searchbar}
          {body}
        </>
      )}
    </>
  ) : (
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
        {searchbar}
        {body}
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
          setMoreModelsExpanded(false);
          setExpandedMaker(null);
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
      <DropdownMenuContent
        className="w-84"
        align="start"
      >
        {models.length > 0 ? (
          <>
            <DropdownMenuLabel label="Model" />
            {tierModels.map((model) =>
              renderModel(model, TIER_ICON[model.tierId])
            )}
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
