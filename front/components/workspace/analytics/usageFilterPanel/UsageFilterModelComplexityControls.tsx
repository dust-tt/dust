import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type {
  UsageFilterModelOption,
  UsageModelTier,
} from "@app/components/workspace/analytics/usageFilter";
import {
  USAGE_MODEL_TIER_LABEL,
  USAGE_MODEL_TIERS,
} from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterAvailabilityStatus } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterAvailabilityStatus";
import {
  getModelMakerDisplayName,
  MODEL_MAKER_IDS,
} from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import {
  BarFull,
  BarHalf,
  BarLow,
  Button,
  Check,
  ChevronDown,
  ChevronRight,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Icon,
  NavigationListLabel,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { Fragment, useState } from "react";

const MODEL_TIER_ICON: Record<UsageModelTier, ComponentType> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};

interface UsageFilterModelComplexityControlsProps {
  moreModelsCatalog: UsageFilterModelOption[];
  selectedModelIds: Set<string>;
  onToggleModel: (model: UsageFilterModelOption) => void;
  activeTier: UsageModelTier;
  onTierChange: (tier: UsageModelTier) => void;
}

function getModelSelectionStatus({
  isSelected,
  isUnavailable,
}: {
  isSelected: boolean;
  isUnavailable: boolean;
}) {
  if (!isSelected && !isUnavailable) {
    return undefined;
  }

  return (
    <div className="flex items-center gap-2">
      {isUnavailable && <UsageFilterAvailabilityStatus />}
      {isSelected && (
        <Icon visual={Check} size="sm" className="text-muted-foreground" />
      )}
    </div>
  );
}

export function UsageFilterModelComplexityControls({
  moreModelsCatalog,
  selectedModelIds,
  onToggleModel,
  activeTier,
  onTierChange,
}: UsageFilterModelComplexityControlsProps) {
  const { isDark } = useTheme();
  const [isMoreModelsOpen, setIsMoreModelsOpen] = useState(false);
  const [moreModelsSearch, setMoreModelsSearch] = useState("");
  const [expandedModelLab, setExpandedModelLab] =
    useState<ModelMakerIdType | null>(null);

  const handleMoreModelsOpenChange = (open: boolean) => {
    setIsMoreModelsOpen(open);
    if (open) {
      setMoreModelsSearch("");
      setExpandedModelLab(null);
    }
  };

  const handleToggleExpandedModelLab = (lab: ModelMakerIdType) => {
    setExpandedModelLab((current) => (current === lab ? null : lab));
  };

  const moreModelsQuery = moreModelsSearch.trim().toLowerCase();
  const isSearchingMoreModels = moreModelsQuery !== "";

  const moreModelsSearchResults = isSearchingMoreModels
    ? moreModelsCatalog.filter((model) =>
        model.name.toLowerCase().includes(moreModelsQuery)
      )
    : [];

  const moreModelsGroups = MODEL_MAKER_IDS.flatMap((lab) => {
    const labModels = moreModelsCatalog.filter((model) => model.lab === lab);
    return labModels.length > 0 ? [{ lab, models: labModels }] : [];
  });
  const isModelSelectionDisabled = (model: UsageFilterModelOption) =>
    model.disabled && !selectedModelIds.has(model.id);

  return (
    <>
      <NavigationListLabel
        label="Complexity"
        className="bg-transparent font-medium pt-2 pb-0"
        action={
          <DropdownMenu
            open={isMoreModelsOpen}
            onOpenChange={handleMoreModelsOpenChange}
          >
            <DropdownMenuTrigger asChild>
              <Button
                label="More models"
                size="xmini"
                variant="ghost-secondary"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuSearchbar
                name="usage-filter-more-models-search"
                placeholder="Search for model"
                value={moreModelsSearch}
                onChange={setMoreModelsSearch}
              />
              {isSearchingMoreModels ? (
                moreModelsSearchResults.length > 0 ? (
                  moreModelsSearchResults.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      label={model.name}
                      icon={
                        model.lab
                          ? getModelMakerLogo(model.lab, isDark)
                          : undefined
                      }
                      aria-disabled={isModelSelectionDisabled(model)}
                      className={
                        isModelSelectionDisabled(model)
                          ? "opacity-50"
                          : undefined
                      }
                      endComponent={getModelSelectionStatus({
                        isSelected: selectedModelIds.has(model.id),
                        isUnavailable: model.disabled,
                      })}
                      onClick={() => {
                        if (!isModelSelectionDisabled(model)) {
                          onToggleModel(model);
                        }
                      }}
                      onSelect={(e) => e.preventDefault()}
                    />
                  ))
                ) : (
                  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                    No models found
                  </div>
                )
              ) : (
                moreModelsGroups.map(({ lab, models }) => (
                  <Fragment key={lab}>
                    <DropdownMenuItem
                      label={getModelMakerDisplayName(lab)}
                      icon={getModelMakerLogo(lab, isDark)}
                      endComponent={
                        <Icon
                          visual={
                            expandedModelLab === lab
                              ? ChevronDown
                              : ChevronRight
                          }
                          size="xs"
                        />
                      }
                      onClick={() => handleToggleExpandedModelLab(lab)}
                      aria-expanded={expandedModelLab === lab}
                      onSelect={(e) => e.preventDefault()}
                    />
                    {expandedModelLab === lab &&
                      models.map((model) => (
                        <DropdownMenuItem
                          key={model.id}
                          label={model.name}
                          aria-disabled={isModelSelectionDisabled(model)}
                          className={
                            isModelSelectionDisabled(model)
                              ? "pl-8 opacity-50"
                              : "pl-8"
                          }
                          endComponent={getModelSelectionStatus({
                            isSelected: selectedModelIds.has(model.id),
                            isUnavailable: model.disabled,
                          })}
                          onClick={() => {
                            if (!isModelSelectionDisabled(model)) {
                              onToggleModel(model);
                            }
                          }}
                          onSelect={(e) => e.preventDefault()}
                        />
                      ))}
                  </Fragment>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <div className="flex items-center gap-1">
        {USAGE_MODEL_TIERS.map((tier) => (
          <Button
            key={tier}
            label={USAGE_MODEL_TIER_LABEL[tier]}
            icon={MODEL_TIER_ICON[tier]}
            size="xs"
            variant={activeTier === tier ? "primary" : "outline"}
            aria-pressed={activeTier === tier}
            onClick={() => onTierChange(tier)}
          />
        ))}
      </div>
    </>
  );
}
