import type { ModelTierId } from "@app/components/model_picker/modelPickerUtils";
import {
  buildModelPickerCatalog,
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
import type { ComponentType, ReactNode } from "react";
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

const TIER_ICON: Record<ModelTierId, ComponentType> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};

type TierModelFilter = AgentModelFilterType & {
  tierId: ModelTierId;
};

interface AgentModelMakerGroup {
  makerId: ModelMakerIdType;
  models: AgentModelFilterType[];
}

interface ModelsFilterCatalog {
  tierModels: TierModelFilter[];
  makerGroups: AgentModelMakerGroup[];
  makerByModelId: Map<string, ModelMakerIdType>;
  unknownModels: AgentModelFilterType[];
  concreteModels: AgentModelFilterType[];
}

function buildModelsFilterCatalog(
  models: AgentModelFilterType[]
): ModelsFilterCatalog {
  const modelsById = new Map(models.map((model) => [model.modelId, model]));
  const tierModels = removeNulls(
    MODEL_TIERS.map((tier) => {
      const model = modelsById.get(tier.metaModelId);
      return model
        ? { ...model, displayName: tier.name, tierId: tier.id }
        : null;
    })
  );

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

  const { makerGroups: modelConfigGroups } =
    buildModelPickerCatalog(concreteModelConfigs);
  const makerGroups = modelConfigGroups.map((group) => ({
    makerId: group.makerId,
    models: removeNulls(
      group.models.map((model) => modelsById.get(model.modelId) ?? null)
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

  return {
    tierModels,
    makerGroups,
    makerByModelId,
    unknownModels,
    concreteModels,
  };
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
    <DropdownMenuCheckboxItem
      label={model.displayName}
      icon={icon}
      truncateText
      checked={isSelected}
      onCheckedChange={() => onToggle(model)}
      // Keep the menu open so several models can be toggled in a row.
      onSelect={(event) => event.preventDefault()}
    />
  );
}

interface ModelMakerGroupProps {
  group: AgentModelMakerGroup;
  selectedModelIds: ReadonlySet<string>;
  isCompact: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onToggleModel: (model: AgentModelFilterType) => void;
}

function ModelMakerGroup({
  group,
  selectedModelIds,
  isCompact,
  isExpanded,
  onToggleExpanded,
  onToggleModel,
}: ModelMakerGroupProps) {
  const { isDark } = useTheme();
  const hasSelectedModel = group.models.some((model) =>
    selectedModelIds.has(model.modelId)
  );

  if (isCompact) {
    return (
      <>
        <DropdownMenuItem
          label={getModelMakerDisplayName(group.makerId)}
          icon={getModelMakerLogo(group.makerId, isDark)}
          endComponent={
            <div className="flex items-center gap-1">
              {hasSelectedModel && (
                <Icon
                  visual={Check}
                  size="sm"
                  className="text-muted-foreground"
                />
              )}
              <Icon
                visual={isExpanded ? ChevronDown : ChevronRight}
                size="xs"
              />
            </div>
          }
          onClick={onToggleExpanded}
          onSelect={(event) => event.preventDefault()}
        />
        {isExpanded &&
          group.models.map((model) => (
            <ModelFilterItem
              key={model.modelId}
              model={model}
              isSelected={selectedModelIds.has(model.modelId)}
              onToggle={onToggleModel}
            />
          ))}
      </>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon visual={getModelMakerLogo(group.makerId, isDark)} size="sm" />
        <span className="grow truncate text-left">
          {getModelMakerDisplayName(group.makerId)}
        </span>
        {hasSelectedModel && (
          <Icon visual={Check} size="sm" className="text-muted-foreground" />
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
        {group.models.map((model) => (
          <ModelFilterItem
            key={model.modelId}
            model={model}
            isSelected={selectedModelIds.has(model.modelId)}
            onToggle={onToggleModel}
          />
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface MoreModelsSectionProps {
  children: ReactNode;
  searchBar: ReactNode;
  isCompact: boolean;
  isExpanded: boolean;
  hasSelectedModel: boolean;
  onToggleExpanded: () => void;
}

function MoreModelsSection({
  children,
  searchBar,
  isCompact,
  isExpanded,
  hasSelectedModel,
  onToggleExpanded,
}: MoreModelsSectionProps) {
  const selectionCheck = hasSelectedModel ? (
    <Icon visual={Check} size="sm" className="text-muted-foreground" />
  ) : null;

  if (isCompact) {
    return (
      <>
        <DropdownMenuItem
          label="More models"
          endComponent={
            <div className="flex items-center gap-1">
              {selectionCheck}
              <Icon
                visual={isExpanded ? ChevronDown : ChevronRight}
                size="xs"
              />
            </div>
          }
          onClick={onToggleExpanded}
          onSelect={(event) => event.preventDefault()}
        />
        {isExpanded && (
          <>
            {searchBar}
            {children}
          </>
        )}
      </>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger onClick={(event) => event.stopPropagation()}>
        <span className="grow truncate text-left">More models</span>
        {selectionCheck}
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
        {searchBar}
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function ModelsFilterMenu({
  models,
  selectedModels,
  setSelectedModels,
  isCompact = false,
}: ModelsFilterMenuProps) {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [moreModelsExpanded, setMoreModelsExpanded] = useState(false);
  const [expandedMaker, setExpandedMaker] = useState<ModelMakerIdType | null>(
    null
  );

  const selectedModelIds = new Set(
    selectedModels.map((model) => model.modelId)
  );
  const {
    tierModels,
    makerGroups,
    makerByModelId,
    unknownModels,
    concreteModels,
  } = buildModelsFilterCatalog(models);

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

  const modelSearchBar = (
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

  const moreModelsBody = isSearching ? (
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
      {makerGroups.map((group) => (
        <ModelMakerGroup
          key={group.makerId}
          group={group}
          selectedModelIds={selectedModelIds}
          isCompact={isCompact}
          isExpanded={expandedMaker === group.makerId}
          onToggleExpanded={() =>
            setExpandedMaker((current) =>
              current === group.makerId ? null : group.makerId
            )
          }
          onToggleModel={toggleModel}
        />
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
  );

  const hasSelectedConcreteModel = concreteModels.some((model) =>
    selectedModelIds.has(model.modelId)
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
      <DropdownMenuContent className="w-84" align="start">
        {models.length > 0 ? (
          <>
            <DropdownMenuLabel label="Model" />
            {tierModels.map((model) => (
              <ModelFilterItem
                key={model.modelId}
                model={model}
                icon={TIER_ICON[model.tierId]}
                isSelected={selectedModelIds.has(model.modelId)}
                onToggle={toggleModel}
              />
            ))}
            {tierModels.length > 0 && concreteModels.length > 0 && (
              <DropdownMenuSeparator />
            )}
            {concreteModels.length > 0 && (
              <MoreModelsSection
                searchBar={modelSearchBar}
                isCompact={isCompact}
                isExpanded={moreModelsExpanded}
                hasSelectedModel={hasSelectedConcreteModel}
                onToggleExpanded={() =>
                  setMoreModelsExpanded((expanded) => !expanded)
                }
              >
                {moreModelsBody}
              </MoreModelsSection>
            )}
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
