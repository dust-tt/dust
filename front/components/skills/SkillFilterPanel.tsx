import { getIcon } from "@app/components/resources/resources_icons";
import { FilterCategoryNav } from "@app/components/shared/filter_panel/FilterCategoryNav";
import { FilterFooter } from "@app/components/shared/filter_panel/FilterFooter";
import { FilterOptionCheckboxList } from "@app/components/shared/filter_panel/FilterOptionCheckboxList";
import { FilterSection } from "@app/components/shared/filter_panel/FilterSection";
import { FilterSelectionSummary } from "@app/components/shared/filter_panel/FilterSelectionSummary";
import {
  filterOptionMatchesSearch,
  filterSelectionCount,
} from "@app/components/shared/filter_panel/filterState";
import { useFilterDraft } from "@app/components/shared/filter_panel/useFilterDraft";
import type {
  SkillFilter,
  SkillFilterCategory,
  SkillFilterOption,
} from "@app/components/skills/skillFilter";
import {
  SKILL_AVAILABILITY_FILTER_OPTIONS,
  SKILL_EDITOR_FILTER_OPTIONS,
  SKILL_FILTER_CATEGORIES,
  SKILL_FILTER_CATEGORY_LABEL,
  toSkillSearchFilters,
} from "@app/components/skills/skillFilter";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { useMCPServers } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  FilterFunnel01,
  Icon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchInput,
} from "@dust-tt/sparkle";
import { useState } from "react";

// The skill search endpoint accepts at most 100 MCP server view IDs.
const MAX_MCP_SERVER_VIEW_IDS = 100;

interface SkillFilterPanelProps {
  owner: LightWorkspaceType;
  filter: SkillFilter;
  onFilterChange: (filter: SkillFilter) => void;
}

function renderOptionIcon(option: SkillFilterOption) {
  return option.category === "tool" ? (
    <Icon visual={getIcon(option.icon)} size="sm" />
  ) : null;
}

export function SkillFilterPanel({
  owner,
  filter,
  onFilterChange,
}: SkillFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] =
    useState<SkillFilterCategory>("availability");
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
  } = useFilterDraft<SkillFilterCategory, SkillFilterOption>(filter);
  const { mcpServers, isMCPServersLoading, isMCPServersError } = useMCPServers({
    owner,
    disabled: !isOpen || activeCategory !== "tool",
  });

  const categoryOptions: Record<SkillFilterCategory, SkillFilterOption[]> = {
    availability: SKILL_AVAILABILITY_FILTER_OPTIONS,
    tool: mcpServers
      .flatMap((server): SkillFilterOption[] =>
        server.views.length > 0
          ? [
              {
                category: "tool",
                id: server.sId,
                name: getMcpServerViewDisplayName({
                  ...server.views[0],
                  server,
                }),
                icon: server.icon,
                mcpServerViewIds: server.views.map((view) => view.sId),
                disabled: false,
              },
            ]
          : []
      )
      .toSorted((a, b) => a.name.localeCompare(b.name)),
    editor: SKILL_EDITOR_FILTER_OPTIONS,
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
  const appliedSelectionCount = filterSelectionCount(
    filter,
    SKILL_FILTER_CATEGORIES
  );
  const categoriesWithSelection = SKILL_FILTER_CATEGORIES.filter(
    (category) => (draftFilter[category]?.length ?? 0) > 0
  );
  const categorySelectionCounts = {
    availability: draftFilter.availability?.length ?? 0,
    tool: draftFilter.tool?.length ?? 0,
    editor: draftFilter.editor?.length ?? 0,
  };
  const activeCategorySelectionCount = categorySelectionCounts[activeCategory];
  const hasTooManyTools =
    (toSkillSearchFilters(draftFilter).mcpServerViewIds?.length ?? 0) >
    MAX_MCP_SERVER_VIEW_IDS;

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
            categories={SKILL_FILTER_CATEGORIES}
            categoryLabels={SKILL_FILTER_CATEGORY_LABEL}
            selectionCounts={categorySelectionCounts}
            activeCategory={activeCategory}
            onCategoryChange={(category) => {
              setActiveCategory(category);
              setSearchText("");
              resetContentScroll();
            }}
          />
          <div className="flex h-full w-80 flex-col gap-2 p-2">
            <FilterSection
              title={SKILL_FILTER_CATEGORY_LABEL[activeCategory]}
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
                name="skill-filter-search"
                value={searchText}
                onChange={(value) => {
                  setSearchText(value);
                  resetContentScroll();
                }}
                placeholder={`Search ${SKILL_FILTER_CATEGORY_LABEL[activeCategory].toLowerCase()}`}
              />
            </FilterSection>
            <div
              ref={setContentScrollContainer}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
            >
              {activeCategory === "tool" && isMCPServersError ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  Failed to load filters.
                </div>
              ) : (
                <FilterOptionCheckboxList
                  key={`${isOpen}|${activeCategory}|${searchText}`}
                  idPrefix={`skill-filter-option-${activeCategory}`}
                  categoryLabel={SKILL_FILTER_CATEGORY_LABEL[activeCategory]}
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
                  status={isMCPServersLoading ? "loading" : "idle"}
                  scrollContainer={contentScrollContainer}
                />
              )}
            </div>
          </div>
          <FilterSelectionSummary
            categoriesWithSelection={categoriesWithSelection}
            categoryLabels={SKILL_FILTER_CATEGORY_LABEL}
            filter={draftFilter}
            onClearCategory={clearCategory}
            onRemoveOption={removeOption}
            renderIcon={renderOptionIcon}
          />
        </div>
        {hasTooManyTools && (
          <div role="alert" className="px-4 py-2 text-sm text-warning">
            Too many tools selected.
          </div>
        )}
        <FilterFooter
          applyDisabled={hasTooManyTools}
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
