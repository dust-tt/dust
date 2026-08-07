import type {
  UsageFilter,
  UsageFilterCategory,
  UsageFilterEntity,
  UsageFilterGroup,
  UsageFilterScope,
  UsageModelTier,
} from "@app/components/workspace/analytics/usageFilter";
import {
  clearUsageFilterCategory,
  removeUsageFilterEntity,
  selectAllUsageFilterEntities,
  toggleUsageFilterEntity,
  USAGE_FILTER_CATEGORIES,
  USAGE_FILTER_CATEGORY_LABEL,
  USAGE_FILTER_SCOPES,
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
                models={categoryEntities.model}
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
            onClearCategory={handleClearCategory}
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
