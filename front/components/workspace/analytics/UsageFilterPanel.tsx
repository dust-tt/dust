import type {
  UsageFilter,
  UsageFilterAgentOption,
  UsageFilterCategory,
  UsageFilterGroup,
  UsageFilterMemberOption,
  UsageFilterModelOption,
  UsageFilterOptionForCategory,
  UsageFilterScope,
  UsageFilterSkillOption,
  UsageFilterSourceOption,
  UsageFilterToolOption,
  UsageModelTier,
} from "@app/components/workspace/analytics/usageFilter";
import {
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
import { useUsageFilter } from "@app/components/workspace/analytics/useUsageFilter";
import { useGroups } from "@app/lib/swr/groups";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
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

// Matches the picker in AnalyticsFilterDropdown, the sibling analytics filter
// that also lists workspace members via useSearchMembers.
const MEMBER_PICKER_PAGE_SIZE = 100;

interface UsageFilterPanelProps {
  owner: LightWorkspaceType;
  // Agents/models/tools/skills/sources are still mock data (see
  // usageFilterMockData.ts — sources are fake connectors standing in for a
  // real db call); members and groups are fetched live below, via the generic
  // member search and group listing endpoints (useSearchMembers, useGroups).
  categoryOptions: {
    agent: UsageFilterAgentOption[];
    model: UsageFilterModelOption[];
    tool: UsageFilterToolOption[];
    skill: UsageFilterSkillOption[];
    source: UsageFilterSourceOption[];
  };
  filter: UsageFilter;
  onFilterChange: (next: UsageFilter) => void;
}

export function UsageFilterPanel({
  owner,
  categoryOptions,
  filter,
  onFilterChange,
}: UsageFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Selections are staged while the panel is open and only propagated
  // when the user clicks Apply.
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
  const [activeScope, setActiveScope] = useState<UsageFilterScope>(
    USAGE_FILTER_SCOPES[0]
  );
  const [activeTier, setActiveTier] = useState<UsageModelTier>(
    USAGE_MODEL_TIERS[0]
  );
  const [searchText, setSearchText] = useState("");
  // Only used for the "member" category: narrows the displayed members down
  // to those belonging to at least one of these groups. Groups only narrow
  // the picker — the user still checks individual members to add them to the
  // filter. Lifted here (rather than owned by UsageFilterMemberGroupsControls)
  // because filteredEntities below needs it too.
  const [selectedGroups, setSelectedGroups] = useState<UsageFilterGroup[]>([]);

  const isMemberCategoryActive = isOpen && activeCategory === "member";

  // Search is applied server-side by useSearchMembers, same as the sibling
  // AnalyticsFilterDropdown's member picker.
  const { members: searchedMembers } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: 0,
    pageSize: MEMBER_PICKER_PAGE_SIZE,
    disabled: !isMemberCategoryActive,
  });

  const { groups: workspaceGroups } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    withMembers: true,
    disabled: !isMemberCategoryActive,
  });

  const memberOptions = useMemo<UsageFilterMemberOption[]>(
    () =>
      searchedMembers.map((member) => ({
        id: member.sId,
        name: member.fullName,
        kind: "member",
        image: member.image,
      })),
    [searchedMembers]
  );

  const groups = useMemo<UsageFilterGroup[]>(
    () =>
      workspaceGroups.map((group) => ({
        id: group.sId,
        name: group.name,
        memberIds: group.memberIds ?? [],
      })),
    [workspaceGroups]
  );

  const resolvedCategoryOptions = useMemo<{
    [C in UsageFilterCategory]: UsageFilterOptionForCategory<C>[];
  }>(
    () => ({
      ...categoryOptions,
      member: memberOptions,
    }),
    [categoryOptions, memberOptions]
  );

  const activeOptions = resolvedCategoryOptions[activeCategory];
  const filteredOptions = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const selectedGroupMemberIds =
      activeCategory === "member" && selectedGroups.length > 0
        ? new Set(selectedGroups.flatMap((group) => group.memberIds))
        : null;
    return activeOptions.filter((option) => {
      if (option.kind === "agent" && option.scope !== activeScope) {
        return false;
      }
      if (option.kind === "model" && option.tier !== activeTier) {
        return false;
      }
      if (selectedGroupMemberIds && !selectedGroupMemberIds.has(option.id)) {
        return false;
      }
      // The member category is already searched server-side by
      // useSearchMembers; re-filtering client-side here would just drop
      // results while the debounced search catches up.
      if (
        activeCategory !== "member" &&
        search &&
        !option.name.toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    });
  }, [
    activeOptions,
    searchText,
    activeScope,
    activeTier,
    activeCategory,
    selectedGroups,
  ]);

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

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleApply = () => {
    onFilterChange(draftFilter);
    setIsOpen(false);
  };

  const handleAddGroup = (group: UsageFilterGroup) => {
    setSelectedGroups((current) =>
      current.some((g) => g.id === group.id) ? current : [...current, group]
    );
  };

  const handleRemoveGroup = (id: string) => {
    setSelectedGroups((current) => current.filter((g) => g.id !== id));
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
        <div className="flex h-96 flex-row divide-x divide-border">
          <UsageFilterCategoryNav
            categories={USAGE_FILTER_CATEGORIES}
            draftFilter={draftFilter}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
          />
          <div className="flex h-full w-72 flex-col gap-2 p-2">
            <NavigationListLabel
              label={USAGE_FILTER_CATEGORY_LABEL[activeCategory]}
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
              name="usage-filter-search"
              value={searchText}
              onChange={setSearchText}
              placeholder={`Search ${USAGE_FILTER_CATEGORY_LABEL[activeCategory].toLowerCase()}`}
            />
            {activeCategory === "member" && (
              <UsageFilterMemberGroupsControls
                groups={groups}
                selectedGroups={selectedGroups}
                onAddGroup={handleAddGroup}
                onRemoveGroup={handleRemoveGroup}
              />
            )}
            {activeCategory === "model" && (
              <UsageFilterModelComplexityControls
                models={categoryOptions.model}
                selectedModelIds={selectedIdsForActiveCategory}
                onToggleModel={(model) => toggleOption("model", model)}
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
              onToggleOption={(option) => toggleOption(activeCategory, option)}
              onSelectAll={() =>
                selectAllFiltered(activeCategory, filteredOptions)
              }
            />
          </div>
          <UsageFilterSelectionSummary
            categoriesWithSelection={categoriesWithSelection}
            draftFilter={draftFilter}
            onClearCategory={clearCategory}
            onRemoveOption={removeOption}
          />
        </div>
        <UsageFilterFooter
          onClearAll={clearAllCategories}
          onCancel={handleCancel}
          onApply={handleApply}
        />
      </PopoverContent>
    </PopoverRoot>
  );
}
