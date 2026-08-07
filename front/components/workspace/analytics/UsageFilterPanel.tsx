import type {
  UsageFilter,
  UsageFilterAgentOption,
  UsageFilterCategory,
  UsageFilterGroup,
  UsageFilterMemberOption,
  UsageFilterModelOption,
  UsageFilterOption,
  UsageFilterScope,
  UsageFilterSkillOption,
  UsageFilterSourceOption,
  UsageFilterToolOption,
  UsageModelTier,
} from "@app/components/workspace/analytics/usageFilter";
import {
  clearUsageFilterCategory,
  removeUsageFilterOption,
  selectAllUsageFilterOptions,
  toggleUsageFilterOption,
  USAGE_FILTER_CATEGORIES,
  USAGE_FILTER_CATEGORY_LABEL,
  USAGE_FILTER_SCOPES,
  USAGE_MODEL_TIERS,
} from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterAgentScopeControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterAgentScopeControls";
import { UsageFilterCategoryNav } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterCategoryNav";
import { UsageFilterFooter } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterFooter";
import { UsageFilterMemberGroupsControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterMemberGroupsControls";
import { UsageFilterModelComplexityControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterModelComplexityControls";
import { UsageFilterOptionCheckboxList } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterOptionCheckboxList";
import { UsageFilterSelectionSummary } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterSelectionSummary";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import {
  BarChart05,
  Button,
  NavigationListLabel,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchInput,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface UsageFilterPanelProps {
  owner: LightWorkspaceType;
  categoryOptions: {
    agent: UsageFilterAgentOption[];
    model: UsageFilterModelOption[];
    tool: UsageFilterToolOption[];
    skill: UsageFilterSkillOption[];
    source: UsageFilterSourceOption[];
  };
  groups: UsageFilterGroup[];
  filter: UsageFilter;
  onFilterChange: (next: UsageFilter) => void;
}

export function UsageFilterPanel({
  owner,
  categoryOptions,
  groups,
  filter,
  onFilterChange,
}: UsageFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Selections are staged while the panel is open and only propagated
  // when the user clicks Apply.
  const [draftFilter, setDraftFilter] = useState<UsageFilter>(filter);
  const [activeCategory, setActiveCategory] =
    useState<UsageFilterCategory>("agent");
  const [activeScope, setActiveScope] = useState<UsageFilterScope>(
    USAGE_FILTER_SCOPES[0]
  );
  const [activeTier, setActiveTier] = useState<UsageModelTier>(
    USAGE_MODEL_TIERS[0]
  );
  const [searchText, setSearchText] = useState("");

  const { members } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: activeCategory === "member" ? searchText : "",
    pageIndex: 0,
    pageSize: 100,
    disabled: !isOpen || activeCategory !== "member",
  });

  const memberOptions = useMemo<UsageFilterMemberOption[]>(
    () =>
      members.map((m) => ({
        id: m.sId,
        name: m.fullName,
        kind: "member",
        image: m.image,
      })),
    [members]
  );

  const resolvedCategoryOptions = useMemo<
    Record<UsageFilterCategory, UsageFilterOption[]>
  >(
    () => ({
      ...categoryOptions,
      member: memberOptions,
    }),
    [categoryOptions, memberOptions]
  );

  const activeOptions = resolvedCategoryOptions[activeCategory];
  const filteredOptions = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return activeOptions.filter((option) => {
      if (option.kind === "agent" && option.scope !== activeScope) {
        return false;
      }
      if (option.kind === "model" && option.tier !== activeTier) {
        return false;
      }
      if (search && !option.name.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });
  }, [activeOptions, searchText, activeScope, activeTier]);

  const selectedIdsForActiveCategory = useMemo(
    () =>
      new Set((draftFilter[activeCategory] ?? []).map((option) => option.id)),
    [draftFilter, activeCategory]
  );

  const appliedSelectionCount = useMemo(
    () =>
      USAGE_FILTER_CATEGORIES.reduce(
        (count, category) => count + (filter[category]?.length ?? 0),
        0
      ),
    [filter]
  );

  const categoriesWithSelection = useMemo(
    () =>
      USAGE_FILTER_CATEGORIES.filter(
        (category) => (draftFilter[category]?.length ?? 0) > 0
      ),
    [draftFilter]
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setDraftFilter(filter);
      setSearchText("");
    }
  };

  const handleCategoryChange = (category: UsageFilterCategory) => {
    setActiveCategory(category);
    setSearchText("");
  };

  const handleClearActiveCategory = () => {
    setDraftFilter(clearUsageFilterCategory(draftFilter, activeCategory));
  };

  const handleClearCategory = (category: UsageFilterCategory) => {
    setDraftFilter(clearUsageFilterCategory(draftFilter, category));
  };

  const handleSelectAllFiltered = () => {
    setDraftFilter(
      selectAllUsageFilterOptions(draftFilter, activeCategory, filteredOptions)
    );
  };

  const handleClearAllCategories = () => {
    setDraftFilter({});
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleApply = () => {
    onFilterChange(draftFilter);
    setIsOpen(false);
  };

  const handleToggleOption = (
    category: UsageFilterCategory,
    option: UsageFilterOption
  ) => {
    setDraftFilter(toggleUsageFilterOption(draftFilter, category, option));
  };

  const handleRemoveOption = (category: UsageFilterCategory, id: string) => {
    setDraftFilter(removeUsageFilterOption(draftFilter, category, id));
  };

  const activeCategorySelectionCount = draftFilter[activeCategory]?.length ?? 0;

  return (
    <PopoverRoot open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          icon={BarChart05}
          label="Filters"
          size="sm"
          variant="outline"
          isCounter={appliedSelectionCount > 0}
          counterValue={String(appliedSelectionCount)}
        />
      </PopoverTrigger>
      <PopoverContent fullWidth align="end" className="w-auto rounded-2xl p-0">
        <div className="flex h-[420px] flex-row divide-x divide-border">
          <UsageFilterCategoryNav
            categories={USAGE_FILTER_CATEGORIES}
            draftFilter={draftFilter}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
          />
          <div className="flex h-full w-[300px] flex-col gap-2 p-2">
            <NavigationListLabel
              label={USAGE_FILTER_CATEGORY_LABEL[activeCategory]}
              className="bg-transparent pt-1.5 pb-0 font-medium"
              action={
                <Button
                  label="Clear"
                  size="xmini"
                  variant="ghost-secondary"
                  onClick={handleClearActiveCategory}
                  disabled={activeCategorySelectionCount === 0}
                  className={
                    activeCategorySelectionCount === 0 ? "invisible" : undefined
                  }
                />
              }
            />
            <SearchInput
              name="usage-filter-search"
              value={searchText}
              onChange={setSearchText}
              placeholder={`Search ${USAGE_FILTER_CATEGORY_LABEL[activeCategory].toLowerCase()}`}
            />
            {activeCategory === "member" && (
              <UsageFilterMemberGroupsControls groups={groups} />
            )}
            {activeCategory === "model" && (
              <UsageFilterModelComplexityControls
                models={categoryOptions.model}
                selectedModelIds={selectedIdsForActiveCategory}
                onToggleModel={(model) => handleToggleOption("model", model)}
                activeTier={activeTier}
                onTierChange={setActiveTier}
              />
            )}
            {activeCategory === "agent" && (
              <UsageFilterAgentScopeControls
                activeScope={activeScope}
                onScopeChange={setActiveScope}
              />
            )}
            <UsageFilterOptionCheckboxList
              category={activeCategory}
              categoryLabel={USAGE_FILTER_CATEGORY_LABEL[activeCategory]}
              options={filteredOptions}
              selectedIds={selectedIdsForActiveCategory}
              onToggleOption={(option) =>
                handleToggleOption(activeCategory, option)
              }
              onSelectAll={handleSelectAllFiltered}
            />
          </div>
          <UsageFilterSelectionSummary
            categoriesWithSelection={categoriesWithSelection}
            draftFilter={draftFilter}
            onClearCategory={handleClearCategory}
            onRemoveOption={handleRemoveOption}
          />
        </div>
        <UsageFilterFooter
          onClearAll={handleClearAllCategories}
          onCancel={handleCancel}
          onApply={handleApply}
        />
      </PopoverContent>
    </PopoverRoot>
  );
}
