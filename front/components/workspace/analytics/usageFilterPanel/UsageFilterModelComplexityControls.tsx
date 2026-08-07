import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type {
  UsageFilterEntity,
  UsageModelLab,
  UsageModelTier,
} from "@app/components/workspace/analytics/usageFilter";
import {
  USAGE_MODEL_LABS,
  USAGE_MODEL_TIER_LABEL,
  USAGE_MODEL_TIERS,
} from "@app/components/workspace/analytics/usageFilter";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
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
import { Fragment, useMemo, useState } from "react";

const MODEL_TIER_ICON: Record<UsageModelTier, ComponentType> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};

interface UsageFilterModelComplexityControlsProps {
  models: UsageFilterEntity[];
  selectedModelIds: Set<string>;
  onToggleModel: (model: UsageFilterEntity) => void;
  activeTier: UsageModelTier;
  onTierChange: (tier: UsageModelTier) => void;
}

export function UsageFilterModelComplexityControls({
  models,
  selectedModelIds,
  onToggleModel,
  activeTier,
  onTierChange,
}: UsageFilterModelComplexityControlsProps) {
  const { isDark } = useTheme();
  // "More models" opens collapsed to just the maker rows; picking one expands
  // its model list. State lives here since it's local to this dropdown and
  // naturally resets whenever the panel is reopened (the popover unmounts
  // its content on close).
  const [isMoreModelsOpen, setIsMoreModelsOpen] = useState(false);
  const [moreModelsSearch, setMoreModelsSearch] = useState("");
  const [expandedModelLab, setExpandedModelLab] =
    useState<UsageModelLab | null>(null);

  const handleMoreModelsOpenChange = (open: boolean) => {
    setIsMoreModelsOpen(open);
    if (open) {
      setMoreModelsSearch("");
      setExpandedModelLab(null);
    }
  };

  const handleToggleExpandedModelLab = (lab: UsageModelLab) => {
    setExpandedModelLab((current) => (current === lab ? null : lab));
  };

  // A search bypasses maker grouping entirely and lists matches flat,
  // mirroring the message composer's model picker.
  const moreModelsQuery = moreModelsSearch.trim().toLowerCase();
  const isSearchingMoreModels = moreModelsQuery !== "";

  const moreModelsSearchResults = useMemo(
    () =>
      isSearchingMoreModels
        ? models.filter((entity) =>
            entity.name.toLowerCase().includes(moreModelsQuery)
          )
        : [],
    [models, isSearchingMoreModels, moreModelsQuery]
  );

  const moreModelsGroups = useMemo(
    () =>
      USAGE_MODEL_LABS.flatMap((lab) => {
        const labModels = models.filter((entity) => entity.lab === lab);
        return labModels.length > 0 ? [{ lab, models: labModels }] : [];
      }),
    [models]
  );

  return (
    <>
      <NavigationListLabel
        label="Complexity"
        className="bg-transparent font-medium"
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
                      endComponent={
                        selectedModelIds.has(model.id) ? (
                          <Icon
                            visual={Check}
                            size="sm"
                            className="text-muted-foreground"
                          />
                        ) : undefined
                      }
                      onClick={() => onToggleModel(model)}
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
                      onSelect={(e) => e.preventDefault()}
                    />
                    {expandedModelLab === lab &&
                      models.map((model) => (
                        <DropdownMenuItem
                          key={model.id}
                          label={model.name}
                          className="pl-8"
                          endComponent={
                            selectedModelIds.has(model.id) ? (
                              <Icon
                                visual={Check}
                                size="sm"
                                className="text-muted-foreground"
                              />
                            ) : undefined
                          }
                          onClick={() => onToggleModel(model)}
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
            onClick={() => onTierChange(tier)}
          />
        ))}
      </div>
    </>
  );
}
