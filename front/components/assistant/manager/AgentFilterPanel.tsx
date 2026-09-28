import type {
  AgentFilter,
  AgentFilterCategory,
  AgentFilterOption,
} from "@app/components/assistant/manager/agentFilter";
import {
  AGENT_ACCESS_FILTER_OPTIONS,
  AGENT_FILTER_CATEGORY_LABEL,
  getAgentModelDisplayName,
  toAgentSearchFilters,
} from "@app/components/assistant/manager/agentFilter";
import { FilterCategoryNav } from "@app/components/shared/filter_panel/FilterCategoryNav";
import { FilterFooter } from "@app/components/shared/filter_panel/FilterFooter";
import { FilterOptionCheckboxList } from "@app/components/shared/filter_panel/FilterOptionCheckboxList";
import { FilterSection } from "@app/components/shared/filter_panel/FilterSection";
import { FilterSelectionSummary } from "@app/components/shared/filter_panel/FilterSelectionSummary";
import {
  clearFilterCategory,
  filterOptionMatchesSearch,
  filterSelectionCount,
} from "@app/components/shared/filter_panel/filterState";
import { useFilterDraft } from "@app/components/shared/filter_panel/useFilterDraft";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import type {
  AgentSearchFacet,
  AgentSearchFilters,
  AgentSearchPermissionFiltering,
} from "@app/types/agent_search/agent_search";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  FilterFunnel01,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchInput,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface AgentFilterPanelProps {
  owner: LightWorkspaceType;
  categories: readonly AgentFilterCategory[];
  searchTerm: string;
  // The tab's own filters: options are the values held by the agents the tab lists.
  tabFilters: AgentSearchFilters;
  permissionFiltering: AgentSearchPermissionFiltering;
  filter: AgentFilter;
  onFilterChange: (filter: AgentFilter) => void;
}

const AGENT_FILTER_CATEGORY_FACET: Record<
  Exclude<AgentFilterCategory, "access">,
  AgentSearchFacet
> = {
  editor: "editors",
  model: "models",
  tag: "tags",
  space: "spaces",
};

function renderOptionIcon(option: AgentFilterOption) {
  return option.category === "editor" ? (
    <Avatar visual={option.image} name={option.name} size="xxs" isRounded />
  ) : null;
}

export function AgentFilterPanel({
  owner,
  categories,
  searchTerm,
  tabFilters,
  permissionFiltering,
  filter,
  onFilterChange,
}: AgentFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<AgentFilterCategory>("access");
  const activeCategory = categories.includes(selectedCategory)
    ? selectedCategory
    : categories[0];
  const [searchText, setSearchText] = useState("");
  const [contentScrollContainer, setContentScrollContainer] =
    useState<HTMLDivElement | null>(null);
  const {
    draftFilter,
    setDraftFilter,
    clearAllCategories,
    clearCategory,
    toggleOption,
    removeOption,
    selectAllFiltered,
  } = useFilterDraft<AgentFilterCategory, AgentFilterOption>(filter);
  const isFacetCategory = activeCategory !== "access";
  // Options are the values held by the agents matching the search and the draft selections of the
  // other categories: the active category ignores its own selection so that its options stay
  // selectable together.
  const { facets, isAgentsLoading, isAgentsError } = useSearchAgents({
    owner,
    searchTerm,
    limit: 0,
    filters: toAgentSearchFilters(
      clearFilterCategory(draftFilter, activeCategory),
      tabFilters
    ),
    permissionFiltering,
    facets: isFacetCategory
      ? [AGENT_FILTER_CATEGORY_FACET[activeCategory]]
      : [],
    disabled: !isOpen || !isFacetCategory,
  });

  const categoryOptions: Record<AgentFilterCategory, AgentFilterOption[]> = {
    access: AGENT_ACCESS_FILTER_OPTIONS,
    editor: (facets?.editors ?? []).map((editor) => ({
      category: "editor",
      id: editor.sId,
      name: editor.fullName,
      image: editor.image,
      disabled: false,
    })),
    model: (facets?.models ?? [])
      .map(
        ({ modelId }): AgentFilterOption => ({
          category: "model",
          id: modelId,
          name: getAgentModelDisplayName(modelId),
          disabled: false,
        })
      )
      .toSorted((a, b) => a.name.localeCompare(b.name)),
    tag: (facets?.tags ?? []).map((tag) => ({
      category: "tag",
      id: tag.sId,
      name: tag.name,
      disabled: false,
    })),
    space: (facets?.spaces ?? []).map((space) => ({
      category: "space",
      id: space.sId,
      name: space.kind === "global" ? GLOBAL_SPACE_NAME : space.name,
      disabled: false,
    })),
  };
  const filteredOptions = categoryOptions[activeCategory].filter((option) =>
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
  const categorySelectionCounts = {
    access: draftFilter.access?.length ?? 0,
    editor: draftFilter.editor?.length ?? 0,
    model: draftFilter.model?.length ?? 0,
    tag: draftFilter.tag?.length ?? 0,
    space: draftFilter.space?.length ?? 0,
  };
  const activeCategorySelectionCount = categorySelectionCounts[activeCategory];

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
            categoryLabels={AGENT_FILTER_CATEGORY_LABEL}
            selectionCounts={categorySelectionCounts}
            activeCategory={activeCategory}
            onCategoryChange={(category) => {
              setSelectedCategory(category);
              setSearchText("");
              resetContentScroll();
            }}
          />
          <div className="flex h-full w-80 flex-col gap-2 p-2">
            <FilterSection
              title={AGENT_FILTER_CATEGORY_LABEL[activeCategory]}
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
                name="agent-filter-search"
                value={searchText}
                onChange={(value) => {
                  setSearchText(value);
                  resetContentScroll();
                }}
                placeholder={`Search ${AGENT_FILTER_CATEGORY_LABEL[activeCategory].toLowerCase()}`}
              />
            </FilterSection>
            <div
              ref={setContentScrollContainer}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
            >
              {isFacetCategory && isAgentsError ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  Failed to load filters.
                </div>
              ) : (
                <FilterOptionCheckboxList
                  key={`${isOpen}|${activeCategory}|${searchText}`}
                  idPrefix={`agent-filter-option-${activeCategory}`}
                  categoryLabel={AGENT_FILTER_CATEGORY_LABEL[activeCategory]}
                  options={filteredOptions}
                  selectedIds={selectedIds}
                  onToggleOption={(option) =>
                    toggleOption(activeCategory, option)
                  }
                  onSelectAll={() =>
                    selectAllFiltered(activeCategory, unselectedOptions)
                  }
                  selectAllLabel="Select all"
                  hasSelectableOptions={unselectedOptions.length > 0}
                  renderIcon={renderOptionIcon}
                  status={
                    isFacetCategory && isAgentsLoading ? "loading" : "idle"
                  }
                  scrollContainer={contentScrollContainer}
                />
              )}
            </div>
          </div>
          <FilterSelectionSummary
            categoriesWithSelection={categoriesWithSelection}
            categoryLabels={AGENT_FILTER_CATEGORY_LABEL}
            filter={draftFilter}
            onClearCategory={clearCategory}
            onRemoveOption={removeOption}
            renderIcon={renderOptionIcon}
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
