import { FilterCategoryNav } from "@app/components/shared/filter_panel/FilterCategoryNav";
import { FilterFooter } from "@app/components/shared/filter_panel/FilterFooter";
import type { FilterOptionListStatus } from "@app/components/shared/filter_panel/FilterOptionCheckboxList";
import { FilterOptionCheckboxList } from "@app/components/shared/filter_panel/FilterOptionCheckboxList";
import { FilterSection } from "@app/components/shared/filter_panel/FilterSection";
import { FilterSelectionSummary } from "@app/components/shared/filter_panel/FilterSelectionSummary";
import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/shared/filter_panel/filterState";
import {
  filterOptionMatchesSearch,
  filterSelectionCount,
} from "@app/components/shared/filter_panel/filterState";
import type { FilterPanelState } from "@app/components/shared/filter_panel/useFilterPanel";
import {
  Button,
  FilterFunnel01,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchInput,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useState } from "react";

interface FilterPanelProps<
  Category extends string,
  Option extends FilterOptionBase,
> {
  panel: FilterPanelState<Category, Option>;
  categories: readonly Category[];
  categoryLabels: Record<Category, string>;
  searchPlaceholders: Record<Category, string>;
  filter: CategoryFilter<Category, Option>;
  onFilterChange: (filter: CategoryFilter<Category, Option>) => void;
  activeCategoryOptions: Option[];
  status: FilterOptionListStatus;
  isError: boolean;
  idPrefix: string;
  renderIcon?: (option: Option) => ReactNode;
  // Replaces the option search and list for categories that are not picked among options.
  renderCategoryContent?: (category: Category) => ReactNode;
  warning?: string;
  applyDisabled?: boolean;
  // Rendered below the categories, for settings that are not a category.
  categoryNavFooter?: ReactNode;
  // Called when the panel opens and on "Clear filters", so the caller can reset its own drafts.
  onOpen?: () => void;
  onClearAll?: () => void;
}

/**
 * @cc [owner:aubin-tchoi,label:product;react] responsive-filter-panel
 * Below 768px viewport width, the panel MUST fit the viewport while keeping category
 * navigation, option selection, selected filters and Apply accessible. Desktop layout
 * MUST remain unchanged.
 */
export function FilterPanel<
  Category extends string,
  Option extends FilterOptionBase,
>({
  panel,
  categories,
  categoryLabels,
  searchPlaceholders,
  filter,
  onFilterChange,
  activeCategoryOptions,
  status,
  isError,
  idPrefix,
  renderIcon,
  renderCategoryContent,
  warning,
  applyDisabled,
  categoryNavFooter,
  onOpen,
  onClearAll,
}: FilterPanelProps<Category, Option>) {
  const { t } = useLingui();
  const {
    isOpen,
    setIsOpen,
    activeCategory,
    setActiveCategory,
    draftFilter,
    setDraftFilter,
    clearAllCategories,
    clearCategory,
    toggleOption,
    removeOption,
    selectAllFiltered,
  } = panel;
  const [searchText, setSearchText] = useState("");
  const [contentScrollContainer, setContentScrollContainer] =
    useState<HTMLDivElement | null>(null);

  const filteredOptions = activeCategoryOptions.filter((option) =>
    filterOptionMatchesSearch(option.name, searchText)
  );
  const selectedIds = new Set(
    (draftFilter[activeCategory] ?? []).map((option) => option.id)
  );
  const unselectedOptions = filteredOptions.filter(
    (option) => !selectedIds.has(option.id)
  );
  const appliedSelectionCount = filterSelectionCount(filter, categories);
  const categoriesWithSelection = categories.filter(
    (category) => (draftFilter[category]?.length ?? 0) > 0
  );
  const categorySelectionCounts = categories.reduce<
    Partial<Record<Category, number>>
  >(
    (counts, category) => ({
      ...counts,
      [category]: draftFilter[category]?.length ?? 0,
    }),
    {}
  );
  const activeCategorySelectionCount = draftFilter[activeCategory]?.length ?? 0;
  const activeCategoryContent = renderCategoryContent?.(activeCategory);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setDraftFilter(filter);
      setSearchText("");
      onOpen?.();
    }
  };

  const resetContentScroll = () => {
    if (contentScrollContainer) {
      contentScrollContainer.scrollTop = 0;
    }
  };

  return (
    <PopoverRoot open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          icon={FilterFunnel01}
          label={t`Filters`}
          size="sm"
          variant="outline"
          isCounter={appliedSelectionCount > 0}
          counterValue={String(appliedSelectionCount)}
        />
      </PopoverTrigger>
      <PopoverContent
        fullWidth
        align="start"
        className="w-auto rounded-2xl p-0 max-md:flex max-md:max-h-(--radix-popover-content-available-height) max-md:w-[calc(100vw-2rem)] max-md:flex-col"
      >
        <div className="flex h-96 flex-row divide-x divide-border max-md:grid max-md:h-128 max-md:min-h-0 max-md:grid-cols-[8rem_minmax(0,1fr)] max-md:grid-rows-[minmax(0,2fr)_minmax(0,1fr)] dark:divide-border-dark">
          <FilterCategoryNav
            className="max-md:min-h-0 max-md:w-32 max-md:min-w-0"
            categories={categories}
            categoryLabels={categoryLabels}
            selectionCounts={categorySelectionCounts}
            activeCategory={activeCategory}
            onCategoryChange={(category) => {
              setActiveCategory(category);
              setSearchText("");
              resetContentScroll();
            }}
            footer={categoryNavFooter}
          />
          <div className="flex h-full w-80 flex-col gap-3 p-2 max-md:min-h-0 max-md:w-auto max-md:min-w-0 max-md:border-e-0">
            <FilterSection
              title={categoryLabels[activeCategory]}
              action={
                <Button
                  label={t({ message: "Clear", context: "clear a filter" })}
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
              {!activeCategoryContent && (
                <SearchInput
                  name={`${idPrefix}-search`}
                  value={searchText}
                  onChange={(value) => {
                    setSearchText(value);
                    resetContentScroll();
                  }}
                  placeholder={searchPlaceholders[activeCategory]}
                />
              )}
            </FilterSection>
            <div
              ref={setContentScrollContainer}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
            >
              {isError ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  <Trans>Failed to load filters.</Trans>
                </div>
              ) : activeCategoryContent ? (
                activeCategoryContent
              ) : (
                <FilterOptionCheckboxList
                  key={`${isOpen}|${activeCategory}|${searchText}`}
                  idPrefix={`${idPrefix}-option-${activeCategory}`}
                  options={filteredOptions}
                  selectedIds={selectedIds}
                  onToggleOption={(option) =>
                    toggleOption(activeCategory, option)
                  }
                  onSelectAll={() =>
                    selectAllFiltered(activeCategory, unselectedOptions)
                  }
                  selectAllLabel={t`Select all`}
                  hasSelectableOptions={unselectedOptions.length > 0}
                  renderIcon={renderIcon}
                  status={
                    status === "loading" && filteredOptions.length > 0
                      ? "updating"
                      : status
                  }
                  scrollContainer={contentScrollContainer}
                />
              )}
            </div>
          </div>
          <FilterSelectionSummary
            className="max-md:col-span-2 max-md:min-h-0 max-md:w-auto max-md:border-t max-md:border-border max-md:dark:border-border-dark"
            categoriesWithSelection={categoriesWithSelection}
            categoryLabels={categoryLabels}
            filter={draftFilter}
            onClearCategory={clearCategory}
            onRemoveOption={removeOption}
            renderIcon={renderIcon}
          />
        </div>
        {warning && (
          <div role="alert" className="px-4 py-2 text-sm text-warning">
            {warning}
          </div>
        )}
        <FilterFooter
          applyDisabled={applyDisabled}
          onClearAll={() => {
            clearAllCategories();
            onClearAll?.();
          }}
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
