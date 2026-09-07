import { FilterCategoryNav } from "@app/components/workspace/analytics/filterPanel/FilterCategoryNav";
import { FilterFooter } from "@app/components/workspace/analytics/filterPanel/FilterFooter";
import { FilterOptionCheckboxList } from "@app/components/workspace/analytics/filterPanel/FilterOptionCheckboxList";
import { FilterSelectionSummary } from "@app/components/workspace/analytics/filterPanel/FilterSelectionSummary";
import { filterOptionMatchesSearch } from "@app/components/workspace/analytics/filterPanel/filterState";
import type {
  ConsumptionFacetOptions,
  UsageFilter,
  UsageFilterAgentScope,
  UsageFilterCategory,
  UsageFilterGroup,
  UsageFilterOption,
} from "@app/components/workspace/analytics/usageFilter";
import {
  getUsageFilterCategories,
  toConsumptionScopeFilter,
  USAGE_FILTER_AGENT_SCOPES,
  USAGE_FILTER_CATEGORIES,
  USAGE_FILTER_CATEGORY_LABEL,
} from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterAgentScopeControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterAgentScopeControls";
import { UsageFilterMemberGroupsControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterMemberGroupsControls";
import { UsageFilterOptionIcon } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterOptionIcon";
import { UsageFilterSection } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterSection";
import { useUsageFilter } from "@app/components/workspace/analytics/useUsageFilter";
import { useConsumptionFacets } from "@app/hooks/useConsumptionFacets";
import { useToggleSelectionList } from "@app/hooks/useToggleSelectionList";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
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

export interface UsageFilterPanelProps {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  filter: UsageFilter;
  analyticsScope?: ConsumptionAnalyticsScope;
  onFilterChange: (next: UsageFilter) => void;
  onOpenChange?: (open: boolean) => void;
  showMemberGroupFilter?: boolean;
}

export function UsageFilterPanel({
  owner,
  period,
  filter,
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
  onFilterChange,
  onOpenChange,
  showMemberGroupFilter = true,
}: UsageFilterPanelProps) {
  const categories = getUsageFilterCategories(analyticsScope);
  const shouldShowMemberGroupFilter =
    showMemberGroupFilter && analyticsScope.kind !== "personal";
  const state = useUsageFilterPanelState({
    owner,
    filter,
    showMemberGroupFilter: shouldShowMemberGroupFilter,
    categories,
  });
  const {
    options: categoryOptions,
    isFacetsLoading,
    isFacetsError,
    isFacetsValidating,
  } = useConsumptionFacets({
    workspaceId: owner.sId,
    period,
    filter: state.draftScopeFilter,
    analyticsScope,
    disabled: !state.isOpen,
  });

  return (
    <UsageFilterPanelView
      filter={filter}
      onFilterChange={onFilterChange}
      onOpenChange={onOpenChange}
      showMemberGroupFilter={shouldShowMemberGroupFilter}
      categories={categories}
      state={state}
      categoryOptions={categoryOptions}
      isFacetsLoading={isFacetsLoading}
      isFacetsError={Boolean(isFacetsError)}
      isFacetsValidating={isFacetsValidating}
    />
  );
}

interface UseUsageFilterPanelStateParams {
  owner: LightWorkspaceType;
  filter: UsageFilter;
  showMemberGroupFilter: boolean;
  categories?: readonly UsageFilterCategory[];
}

export function useUsageFilterPanelState({
  owner,
  filter,
  showMemberGroupFilter,
  categories = USAGE_FILTER_CATEGORIES,
}: UseUsageFilterPanelStateParams) {
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
  const [activeCategory, setActiveCategory] = useState<UsageFilterCategory>(
    categories[0] ?? "agent"
  );
  const [activeScope, setActiveScope] = useState<UsageFilterAgentScope>("all");
  const [searchText, setSearchText] = useState("");
  const [contentScrollContainer, setContentScrollContainer] =
    useState<HTMLDivElement | null>(null);
  const selectedGroups = useToggleSelectionList<UsageFilterGroup>();

  const draftScopeFilter = useMemo(
    () => toConsumptionScopeFilter(draftFilter),
    [draftFilter]
  );
  const isMemberCategoryActive = isOpen && activeCategory === "member";
  const { groups: workspaceGroups } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    withMembers: true,
    disabled: !isMemberCategoryActive || !showMemberGroupFilter,
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

  return {
    isOpen,
    setIsOpen,
    draftFilter,
    setDraftFilter,
    clearAllCategories,
    clearCategory,
    toggleOption,
    removeOption,
    selectAllFiltered,
    activeCategory,
    setActiveCategory,
    activeScope,
    setActiveScope,
    searchText,
    setSearchText,
    contentScrollContainer,
    setContentScrollContainer,
    selectedGroups,
    draftScopeFilter,
    groups,
  };
}

interface UsageFilterPanelViewProps {
  filter: UsageFilter;
  onFilterChange: (next: UsageFilter) => void;
  onOpenChange?: (open: boolean) => void;
  showMemberGroupFilter: boolean;
  categories?: readonly UsageFilterCategory[];
  state: ReturnType<typeof useUsageFilterPanelState>;
  categoryOptions: ConsumptionFacetOptions;
  isFacetsLoading: boolean;
  isFacetsError: boolean;
  isFacetsValidating: boolean;
}

export function UsageFilterPanelView({
  filter,
  onFilterChange,
  onOpenChange,
  showMemberGroupFilter,
  categories = USAGE_FILTER_CATEGORIES,
  state,
  categoryOptions,
  isFacetsLoading,
  isFacetsError,
  isFacetsValidating,
}: UsageFilterPanelViewProps) {
  const {
    isOpen,
    setIsOpen,
    draftFilter,
    setDraftFilter,
    clearAllCategories,
    clearCategory,
    toggleOption,
    removeOption,
    selectAllFiltered,
    activeCategory: selectedCategory,
    setActiveCategory,
    activeScope,
    setActiveScope,
    searchText,
    setSearchText,
    contentScrollContainer,
    setContentScrollContainer,
    selectedGroups,
    groups,
  } = state;

  const activeCategory = categories.includes(selectedCategory)
    ? selectedCategory
    : (categories[0] ?? "agent");

  const activeOptions = categoryOptions[activeCategory];
  const filteredOptions = useMemo(() => {
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
      if (selectedGroupMemberIds && !selectedGroupMemberIds.has(option.id)) {
        return false;
      }
      return filterOptionMatchesSearch(option.name, searchText);
    });
  }, [
    activeOptions,
    searchText,
    activeScope,
    activeCategory,
    selectedGroups.items,
  ]);

  const optionListKey = `${isOpen}|${activeCategory}|${searchText}|${activeScope}`;
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

  const appliedSelectionCount = categories.reduce(
    (count, category) => count + (filter[category]?.length ?? 0),
    0
  );
  const categoriesWithSelection = useMemo(
    () =>
      categories.filter((category) => (draftFilter[category]?.length ?? 0) > 0),
    [categories, draftFilter]
  );
  const categorySelectionCounts = useMemo(() => {
    const counts: Partial<Record<UsageFilterCategory, number>> = {};
    for (const category of categories) {
      counts[category] = draftFilter[category]?.length ?? 0;
    }
    return counts;
  }, [categories, draftFilter]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
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
            categories={categories}
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
              {activeCategory === "member" && showMemberGroupFilter && (
                <UsageFilterMemberGroupsControls
                  groups={groups}
                  selectedGroups={selectedGroups.items}
                  onAddGroup={selectedGroups.add}
                  onRemoveGroup={selectedGroups.remove}
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
                  status={
                    isFacetsLoading
                      ? "loading"
                      : isFacetsValidating
                        ? "updating"
                        : "idle"
                  }
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
