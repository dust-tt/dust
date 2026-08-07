import type {
  UsageFilter,
  UsageFilterCategory,
  UsageFilterEntity,
  UsageFilterGroup,
  UsageFilterScope,
  UsageModelLab,
  UsageModelTier,
} from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterGroup,
  clearUsageFilterCategory,
  removeUsageFilterEntity,
  removeUsageFilterGroup,
  selectAllUsageFilterEntities,
  toggleUsageFilterEntity,
  USAGE_FILTER_CATEGORIES,
  USAGE_FILTER_CATEGORY_LABEL,
  USAGE_FILTER_SCOPES,
  USAGE_MODEL_LABS,
  USAGE_MODEL_TIERS,
} from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterAgentScopeControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterAgentScopeControls";
import { UsageFilterCategoryNav } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterCategoryNav";
import { UsageFilterEntityCheckboxList } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterEntityCheckboxList";
import { UsageFilterFooter } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterFooter";
import { UsageFilterMemberGroupsControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterMemberGroupsControls";
import { UsageFilterModelComplexityControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterModelComplexityControls";
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
  // Agents/models/tools/skills/sources are still mock data (see
  // usageFilterMockData.ts — sources are fake connectors standing in for a
  // real db call); members are fetched live below (useSearchMembers).
  categoryEntities: Record<
    "agent" | "model" | "tool" | "skill" | "source",
    UsageFilterEntity[]
  >;
  groups: UsageFilterGroup[];
  filter: UsageFilter;
  onFilterChange: (next: UsageFilter) => void;
}

export function UsageFilterPanel({
  owner,
  categoryEntities,
  groups,
  filter,
  onFilterChange,
}: UsageFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Selections are staged here while the panel is open and only propagated to
  // `onFilterChange` when the user clicks Apply. Cancel (or dismissing the
  // popover any other way) simply drops the draft: it gets re-synced from
  // `filter` the next time the panel opens.
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
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [isMoreModelsOpen, setIsMoreModelsOpen] = useState(false);
  const [moreModelsSearch, setMoreModelsSearch] = useState("");
  // "More models" opens collapsed to just the maker rows; picking one expands
  // its model list. Cleared whenever the dropdown re-opens.
  const [expandedModelLab, setExpandedModelLab] =
    useState<UsageModelLab | null>(null);
  // Only used for the "member" category: narrows the displayed members down
  // to those belonging to at least one of these groups. Not currently backed
  // by real group-membership data (the search endpoint has no such concept
  // yet), so it's UI-only until that exists.
  const [selectedGroups, setSelectedGroups] = useState<UsageFilterGroup[]>([]);
  // Sections are open by default; a category lands here once the user
  // collapses it.
  const [collapsedCategories, setCollapsedCategories] = useState<
    Set<UsageFilterCategory>
  >(new Set());

  const { members } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: activeCategory === "member" ? searchText : "",
    pageIndex: 0,
    pageSize: 100,
    disabled: !isOpen || activeCategory !== "member",
  });

  const memberEntities = useMemo(
    () => members.map((m) => ({ id: m.sId, name: m.fullName, image: m.image })),
    [members]
  );

  const resolvedCategoryEntities = useMemo<
    Record<UsageFilterCategory, UsageFilterEntity[]>
  >(
    () => ({
      ...categoryEntities,
      member: memberEntities,
    }),
    [categoryEntities, memberEntities]
  );

  const activeEntities = resolvedCategoryEntities[activeCategory];
  const filteredEntities = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return activeEntities.filter((entity) => {
      if (activeCategory === "agent" && entity.scope !== activeScope) {
        return false;
      }
      if (activeCategory === "model" && entity.tier !== activeTier) {
        return false;
      }
      if (search && !entity.name.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });
  }, [activeEntities, searchText, activeScope, activeTier, activeCategory]);

  // "More models" browses every model grouped by maker, independent of the
  // Fast/Standard/Complex quick filter above. Groups start collapsed to just
  // their maker row; a search bypasses grouping entirely and lists matches
  // flat, mirroring the message composer's model picker.
  const moreModelsQuery = moreModelsSearch.trim().toLowerCase();
  const isSearchingMoreModels = moreModelsQuery !== "";

  const moreModelsSearchResults = useMemo(
    () =>
      isSearchingMoreModels
        ? categoryEntities.model.filter((entity) =>
            entity.name.toLowerCase().includes(moreModelsQuery)
          )
        : [],
    [categoryEntities, isSearchingMoreModels, moreModelsQuery]
  );

  const moreModelsGroups = useMemo(
    () =>
      USAGE_MODEL_LABS.flatMap((lab) => {
        const models = categoryEntities.model.filter(
          (entity) => entity.lab === lab
        );
        return models.length > 0 ? [{ lab, models }] : [];
      }),
    [categoryEntities]
  );

  const availableGroups = useMemo(
    () =>
      groups.filter(
        (group) => !selectedGroups.some((selected) => selected.id === group.id)
      ),
    [groups, selectedGroups]
  );

  const selectedIdsForActiveCategory = useMemo(
    () =>
      new Set((draftFilter[activeCategory] ?? []).map((entity) => entity.id)),
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
      setIsAddGroupOpen(false);
      setIsMoreModelsOpen(false);
    }
  };

  const handleCategoryChange = (category: UsageFilterCategory) => {
    setActiveCategory(category);
    setSearchText("");
    setIsAddGroupOpen(false);
    setIsMoreModelsOpen(false);
  };

  const handleAddGroup = (group: UsageFilterGroup) => {
    setSelectedGroups((current) => addUsageFilterGroup(current, group));
    setIsAddGroupOpen(false);
  };

  const handleRemoveGroup = (id: string) => {
    setSelectedGroups((current) => removeUsageFilterGroup(current, id));
  };

  const handleClearActiveCategory = () => {
    setDraftFilter(clearUsageFilterCategory(draftFilter, activeCategory));
  };

  const handleClearCategory = (category: UsageFilterCategory) => {
    setDraftFilter(clearUsageFilterCategory(draftFilter, category));
  };

  const handleToggleCategoryOpen = (category: UsageFilterCategory) => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setDraftFilter(
      selectAllUsageFilterEntities(
        draftFilter,
        activeCategory,
        filteredEntities
      )
    );
  };

  const handleClearAll = () => {
    setDraftFilter({});
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleApply = () => {
    onFilterChange(draftFilter);
    setIsOpen(false);
  };

  const handleToggleEntity = (
    category: UsageFilterCategory,
    entity: UsageFilterEntity
  ) => {
    setDraftFilter(toggleUsageFilterEntity(draftFilter, category, entity));
  };

  const handleRemoveEntity = (category: UsageFilterCategory, id: string) => {
    setDraftFilter(removeUsageFilterEntity(draftFilter, category, id));
  };

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
              <UsageFilterMemberGroupsControls
                isAddGroupOpen={isAddGroupOpen}
                onToggleAddGroupOpen={() =>
                  setIsAddGroupOpen((current) => !current)
                }
                availableGroups={availableGroups}
                onAddGroup={handleAddGroup}
                selectedGroups={selectedGroups}
                onRemoveGroup={handleRemoveGroup}
              />
            )}
            {activeCategory === "model" && (
              <UsageFilterModelComplexityControls
                isMoreModelsOpen={isMoreModelsOpen}
                onMoreModelsOpenChange={handleMoreModelsOpenChange}
                moreModelsSearch={moreModelsSearch}
                onMoreModelsSearchChange={setMoreModelsSearch}
                isSearchingMoreModels={isSearchingMoreModels}
                moreModelsSearchResults={moreModelsSearchResults}
                moreModelsGroups={moreModelsGroups}
                expandedModelLab={expandedModelLab}
                onToggleExpandedModelLab={handleToggleExpandedModelLab}
                selectedModelIds={selectedIdsForActiveCategory}
                onToggleModel={(model) => handleToggleEntity("model", model)}
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
            <UsageFilterEntityCheckboxList
              category={activeCategory}
              categoryLabel={USAGE_FILTER_CATEGORY_LABEL[activeCategory]}
              entities={filteredEntities}
              selectedIds={selectedIdsForActiveCategory}
              onToggleEntity={(entity) =>
                handleToggleEntity(activeCategory, entity)
              }
              onSelectAll={handleSelectAllFiltered}
            />
          </div>
          <UsageFilterSelectionSummary
            categoriesWithSelection={categoriesWithSelection}
            draftFilter={draftFilter}
            collapsedCategories={collapsedCategories}
            onClearCategory={handleClearCategory}
            onToggleCategoryOpen={handleToggleCategoryOpen}
            onRemoveEntity={handleRemoveEntity}
          />
        </div>
        <UsageFilterFooter
          onClearAll={handleClearAll}
          onCancel={handleCancel}
          onApply={handleApply}
        />
      </PopoverContent>
    </PopoverRoot>
  );
}
