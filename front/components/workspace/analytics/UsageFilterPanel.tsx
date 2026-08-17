import { FilterCategoryNav } from "@app/components/workspace/analytics/filterPanel/FilterCategoryNav";
import { FilterFooter } from "@app/components/workspace/analytics/filterPanel/FilterFooter";
import { FilterOptionCheckboxList } from "@app/components/workspace/analytics/filterPanel/FilterOptionCheckboxList";
import { FilterSelectionSummary } from "@app/components/workspace/analytics/filterPanel/FilterSelectionSummary";
import type {
  UsageFilter,
  UsageFilterAgentScope,
  UsageFilterCategory,
  UsageFilterGroup,
  UsageFilterOption,
} from "@app/components/workspace/analytics/usageFilter";
import {
  toConsumptionScopeFilter,
  USAGE_FILTER_AGENT_SCOPES,
  USAGE_FILTER_CATEGORIES,
  USAGE_FILTER_CATEGORY_LABEL,
  usageFilterSelectionCount,
} from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterAgentScopeControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterAgentScopeControls";
import { UsageFilterMemberGroupsControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterMemberGroupsControls";
import { UsageFilterModelComplexityControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterModelComplexityControls";
import { UsageFilterOptionIcon } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterOptionIcon";
import { UsageFilterSection } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterSection";
import { useUsageFilter } from "@app/components/workspace/analytics/useUsageFilter";
import { useConsumptionFacets } from "@app/hooks/useConsumptionFacets";
import { useToggleSelectionList } from "@app/hooks/useToggleSelectionList";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import { useGroups } from "@app/lib/swr/groups";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  FilterFunnel01,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchInput,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

const DEFAULT_MODEL_TIER: ModelsTierName = "balanced";

interface UsageFilterPanelProps {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  filter: UsageFilter;
  onFilterChange: (next: UsageFilter) => void;
}

export function UsageFilterPanel({
  owner,
  period,
  filter,
  onFilterChange,
}: UsageFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Selections are staged while the panel is open and only propagated when
  // the user clicks Apply. Facet availability follows the staged query.
  const {
    draftFilter,
    setDraftFilter,
    clearAllCategories,
    clearCategory,
    toggleOption,
    removeOption,
    selectAllFiltered,
  } = useUsageFilter(filter);
  const [activeCategory, setActiveCategory] =
    useState<UsageFilterCategory>("agent");
  const [activeScope, setActiveScope] = useState<UsageFilterAgentScope>("all");
  const [activeTier, setActiveTier] =
    useState<ModelsTierName>(DEFAULT_MODEL_TIER);
  const [searchText, setSearchText] = useState("");
  const [contentScrollContainer, setContentScrollContainer] =
    useState<HTMLDivElement | null>(null);
  const selectedGroups = useToggleSelectionList<UsageFilterGroup>();

  const draftScopeFilter = useMemo(
    () => toConsumptionScopeFilter(draftFilter),
    [draftFilter]
  );
  const {
    options: categoryOptions,
    isFacetsLoading,
    isFacetsError,
    isFacetsValidating,
  } = useConsumptionFacets({
    workspaceId: owner.sId,
    period,
    filter: draftScopeFilter,
    disabled: !isOpen,
  });

  const isMemberCategoryActive = isOpen && activeCategory === "member";
  const { groups: workspaceGroups } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    withMembers: true,
    disabled: !isMemberCategoryActive,
  });

  const groups = useMemo<UsageFilterGroup[]>(
    () =>
      workspaceGroups.map((group) => ({
        id: group.sId,
        name: group.name,
        memberIds: group.memberIds ?? [],
      })),
    [workspaceGroups]
  );

  const activeOptions = categoryOptions[activeCategory];
  const filteredOptions = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const selectedGroupMemberIds =
      activeCategory === "member" && selectedGroups.items.length > 0
        ? new Set(selectedGroups.items.flatMap((group) => group.memberIds))
        : null;

    return activeOptions.filter((option) => {
      if (
        option.kind === "agent" &&
        activeScope !== "all" &&
        option.scope !== activeScope
      ) {
        return false;
      }
      if (option.kind === "model" && option.tier !== activeTier) {
        return false;
      }
      if (selectedGroupMemberIds && !selectedGroupMemberIds.has(option.id)) {
        return false;
      }
      return !search || option.name.toLowerCase().includes(search);
    });
  }, [
    activeOptions,
    searchText,
    activeScope,
    activeTier,
    activeCategory,
    selectedGroups.items,
  ]);

  const optionListKey = `${isOpen}|${activeCategory}|${searchText}|${activeScope}|${activeTier}`;
  const selectedIdsForActiveCategory = useMemo(
    () =>
      new Set((draftFilter[activeCategory] ?? []).map((option) => option.id)),
    [draftFilter, activeCategory]
  );
  const enabledFilteredOptions = filteredOptions.filter(
    (option) => !option.disabled
  );
  const unselectedEnabledOptions = enabledFilteredOptions.filter(
    (option) => !selectedIdsForActiveCategory.has(option.id)
  );

  const appliedSelectionCount = usageFilterSelectionCount(filter);
  const categoriesWithSelection = useMemo(
    () =>
      USAGE_FILTER_CATEGORIES.filter(
        (category) => (draftFilter[category]?.length ?? 0) > 0
      ),
    [draftFilter]
  );
  const categorySelectionCounts = useMemo(() => {
    const counts: Partial<Record<UsageFilterCategory, number>> = {};
    for (const category of USAGE_FILTER_CATEGORIES) {
      counts[category] = draftFilter[category]?.length ?? 0;
    }
    return counts;
  }, [draftFilter]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setDraftFilter(filter);
      setSearchText("");
      selectedGroups.setItems([]);
    }
  };

  const resetContentScroll = () => {
    if (contentScrollContainer) {
      contentScrollContainer.scrollTop = 0;
    }
  };

  const handleCategoryChange = (category: UsageFilterCategory) => {
    setActiveCategory(category);
    setSearchText("");
    resetContentScroll();
  };

  const handleSearchChange = (search: string) => {
    setSearchText(search);
    resetContentScroll();
  };

  const activeCategorySelectionCount = draftFilter[activeCategory]?.length ?? 0;

  return (
    <PopoverRoot open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          icon={FilterFunnel01}
          label="Filters"
          size="sm"
          variant="outline"
          isCounter={appliedSelectionCount > 0}
          counterValue={String(appliedSelectionCount)}
        />
      </PopoverTrigger>
      <PopoverContent fullWidth align="end" className="w-auto rounded-2xl p-0">
        <div className="flex h-96 flex-row divide-x divide-border">
          <FilterCategoryNav
            categories={USAGE_FILTER_CATEGORIES}
            categoryLabels={USAGE_FILTER_CATEGORY_LABEL}
            selectionCounts={categorySelectionCounts}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
          />
          <div className="flex h-full w-80 flex-col gap-2 p-2">
            <UsageFilterSection
              title={USAGE_FILTER_CATEGORY_LABEL[activeCategory]}
              action={
                <Button
                  label="Clear"
                  size="xmini"
                  variant="ghost-secondary"
                  onClick={() => clearCategory(activeCategory)}
                  disabled={activeCategorySelectionCount === 0}
                  className={
                    activeCategorySelectionCount === 0 ? "invisible" : undefined
                  }
                />
              }
            >
              <SearchInput
                name="usage-filter-search"
                value={searchText}
                onChange={handleSearchChange}
                placeholder={`Search ${USAGE_FILTER_CATEGORY_LABEL[activeCategory].toLowerCase()}`}
              />
            </UsageFilterSection>
            <div
              ref={setContentScrollContainer}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
            >
              {activeCategory === "member" && (
                <UsageFilterMemberGroupsControls
                  groups={groups}
                  selectedGroups={selectedGroups.items}
                  onAddGroup={selectedGroups.add}
                  onRemoveGroup={selectedGroups.remove}
                />
              )}
              {activeCategory === "model" && (
                <UsageFilterModelComplexityControls
                  moreModelsCatalog={categoryOptions.model}
                  selectedModelIds={selectedIdsForActiveCategory}
                  onToggleModel={(model) => toggleOption("model", model)}
                  activeTier={activeTier}
                  onTierChange={(tier) => {
                    setActiveTier(tier);
                    resetContentScroll();
                  }}
                />
              )}
              {activeCategory === "agent" && (
                <UsageFilterAgentScopeControls
                  scopes={USAGE_FILTER_AGENT_SCOPES}
                  activeScope={activeScope}
                  onScopeChange={(scope) => {
                    setActiveScope(scope);
                    resetContentScroll();
                  }}
                />
              )}
              {isFacetsError ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  Failed to load filters.
                </div>
              ) : (
                <FilterOptionCheckboxList
                  key={optionListKey}
                  idPrefix={`usage-filter-option-${activeCategory}`}
                  categoryLabel={USAGE_FILTER_CATEGORY_LABEL[activeCategory]}
                  options={filteredOptions}
                  selectedIds={selectedIdsForActiveCategory}
                  onToggleOption={(option) =>
                    toggleOption(activeCategory, option)
                  }
                  onSelectAll={() =>
                    selectAllFiltered(activeCategory, unselectedEnabledOptions)
                  }
                  selectAllLabel="Select all"
                  hasSelectableOptions={unselectedEnabledOptions.length > 0}
                  renderIcon={(option) => (
                    <UsageFilterOptionIcon option={option} />
                  )}
                  isLoading={isFacetsLoading}
                  isUpdating={isFacetsValidating}
                  scrollContainer={contentScrollContainer}
                />
              )}
            </div>
          </div>
          <FilterSelectionSummary<UsageFilterCategory, UsageFilterOption>
            categoriesWithSelection={categoriesWithSelection}
            categoryLabels={USAGE_FILTER_CATEGORY_LABEL}
            filter={draftFilter}
            onClearCategory={clearCategory}
            onRemoveOption={removeOption}
            renderIcon={(option) => <UsageFilterOptionIcon option={option} />}
          />
        </div>
        <FilterFooter
          onClearAll={clearAllCategories}
          onCancel={() => setIsOpen(false)}
          onApply={() => {
            onFilterChange(draftFilter);
            setIsOpen(false);
          }}
        />
      </PopoverContent>
    </PopoverRoot>
  );
}
