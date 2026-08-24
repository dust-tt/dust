import { AutomationsFilterOptionIcon } from "@app/components/workspace/analytics/automations/AutomationsFilterOptionIcon";
import type {
  AutomationsFilter,
  AutomationsFilterCategory,
  AutomationsFilterOption,
} from "@app/components/workspace/analytics/automationsFilter";
import {
  AUTOMATIONS_FILTER_CATEGORIES,
  AUTOMATIONS_FILTER_CATEGORY_LABEL,
  automationsFilterSelectionCount,
  toAutomationsScopeFilter,
} from "@app/components/workspace/analytics/automationsFilter";
import { FilterCategoryNav } from "@app/components/workspace/analytics/filterPanel/FilterCategoryNav";
import { FilterFooter } from "@app/components/workspace/analytics/filterPanel/FilterFooter";
import { FilterOptionCheckboxList } from "@app/components/workspace/analytics/filterPanel/FilterOptionCheckboxList";
import { FilterSelectionSummary } from "@app/components/workspace/analytics/filterPanel/FilterSelectionSummary";
import { useAutomationsFilter } from "@app/components/workspace/analytics/useAutomationsFilter";
import { useConsumptionFacets } from "@app/hooks/useConsumptionFacets";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  FilterFunnel01,
  NavigationListLabel,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchInput,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

// The panel only shows agents and members, so it skips the six other
// dimensions rather than paying for their Elasticsearch sweeps and catalogs.
const AUTOMATIONS_FACET_DIMENSIONS: ConsumptionScopeDimension[] = [
  "agent",
  "user",
];

const TYPE_OPTIONS: AutomationsFilterOption[] = [
  { id: "schedule", name: "Schedule", disabled: false, category: "type" },
  { id: "webhook", name: "Webhook", disabled: false, category: "type" },
];

interface AutomationsFilterPanelProps {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  filter: AutomationsFilter;
  onFilterChange: (next: AutomationsFilter) => void;
  categories?: readonly AutomationsFilterCategory[];
  agentOptions?: { agentId: string; name: string; pictureUrl: string | null }[];
}

export function AutomationsFilterPanel({
  owner,
  period,
  filter,
  onFilterChange,
  categories = AUTOMATIONS_FILTER_CATEGORIES,
  agentOptions,
}: AutomationsFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    draftFilter,
    setDraftFilter,
    clearAllCategories,
    clearCategory,
    toggleOption,
    removeOption,
    selectAllFiltered,
  } = useAutomationsFilter(filter);
  const [activeCategory, setActiveCategory] =
    useState<AutomationsFilterCategory>(categories[0]);
  const [searchText, setSearchText] = useState("");
  const [contentScrollContainer, setContentScrollContainer] =
    useState<HTMLDivElement | null>(null);

  const draftScopeFilter = useMemo(
    () => toAutomationsScopeFilter(draftFilter),
    [draftFilter]
  );
  const {
    options: facetOptions,
    isFacetsLoading,
    isFacetsError,
    isFacetsValidating,
  } = useConsumptionFacets({
    workspaceId: owner.sId,
    period,
    filter: draftScopeFilter,
    scope: "automations",
    dimensions: AUTOMATIONS_FACET_DIMENSIONS,
    disabled: !isOpen || agentOptions !== undefined,
  });

  const categoryOptions = useMemo<
    Record<AutomationsFilterCategory, AutomationsFilterOption[]>
  >(
    () => ({
      agent: agentOptions
        ? agentOptions.map((option) => ({
            id: option.agentId,
            name: option.name,
            disabled: false,
            image: option.pictureUrl,
            category: "agent",
          }))
        : facetOptions.agent.map((option) => ({
            id: option.id,
            name: option.name,
            disabled: option.disabled,
            image: option.image,
            category: "agent",
          })),
      member: facetOptions.member.map((option) => ({
        id: option.id,
        name: option.name,
        disabled: option.disabled,
        image: option.image,
        category: "member",
      })),
      type: TYPE_OPTIONS,
    }),
    [agentOptions, facetOptions]
  );

  const isFacetBackedCategory = activeCategory !== "type";
  const isOptionsLoading = isFacetBackedCategory && isFacetsLoading;

  const activeOptions = categoryOptions[activeCategory];
  const filteredOptions = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return search
      ? activeOptions.filter((option) =>
          option.name.toLowerCase().includes(search)
        )
      : activeOptions;
  }, [activeOptions, searchText]);

  const selectedIdsForActiveCategory = useMemo(
    () =>
      new Set((draftFilter[activeCategory] ?? []).map((option) => option.id)),
    [draftFilter, activeCategory]
  );
  const unselectedEnabledOptions = filteredOptions.filter(
    (option) => !option.disabled && !selectedIdsForActiveCategory.has(option.id)
  );
  const appliedSelectionCount = automationsFilterSelectionCount(
    filter,
    categories
  );
  const categoriesWithSelection = useMemo(
    () =>
      categories.filter((category) => (draftFilter[category]?.length ?? 0) > 0),
    [categories, draftFilter]
  );
  const categorySelectionCounts = useMemo(() => {
    const counts: Partial<Record<AutomationsFilterCategory, number>> = {};
    for (const category of categories) {
      counts[category] = draftFilter[category]?.length ?? 0;
    }
    return counts;
  }, [categories, draftFilter]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setDraftFilter(filter);
      setSearchText("");
    }
  };

  const resetContentScroll = () => {
    if (contentScrollContainer) {
      contentScrollContainer.scrollTop = 0;
    }
  };

  const handleCategoryChange = (category: AutomationsFilterCategory) => {
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
            categoryLabels={AUTOMATIONS_FILTER_CATEGORY_LABEL}
            selectionCounts={categorySelectionCounts}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
          />
          <div className="flex h-full w-72 flex-col gap-2 p-2">
            <NavigationListLabel
              label={AUTOMATIONS_FILTER_CATEGORY_LABEL[activeCategory]}
              className="bg-transparent pt-1.5 pb-0 font-medium"
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
            />
            <SearchInput
              name="automations-filter-search"
              value={searchText}
              onChange={handleSearchChange}
              placeholder={`Search ${AUTOMATIONS_FILTER_CATEGORY_LABEL[activeCategory].toLowerCase()}`}
            />
            <div
              ref={setContentScrollContainer}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
            >
              {isFacetBackedCategory && isFacetsError ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  Failed to load filters.
                </div>
              ) : (
                <FilterOptionCheckboxList
                  key={`${isOpen}|${activeCategory}|${searchText}`}
                  idPrefix={`automations-filter-option-${activeCategory}`}
                  categoryLabel={
                    AUTOMATIONS_FILTER_CATEGORY_LABEL[activeCategory]
                  }
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
                    <AutomationsFilterOptionIcon option={option} />
                  )}
                  status={
                    isOptionsLoading
                      ? "loading"
                      : isFacetBackedCategory && isFacetsValidating
                        ? "updating"
                        : "idle"
                  }
                  scrollContainer={contentScrollContainer}
                />
              )}
            </div>
          </div>
          <FilterSelectionSummary<
            AutomationsFilterCategory,
            AutomationsFilterOption
          >
            categoriesWithSelection={categoriesWithSelection}
            categoryLabels={AUTOMATIONS_FILTER_CATEGORY_LABEL}
            filter={draftFilter}
            onClearCategory={clearCategory}
            onRemoveOption={removeOption}
            renderIcon={(option) => (
              <AutomationsFilterOptionIcon option={option} />
            )}
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
