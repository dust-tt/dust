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
} from "@app/components/workspace/analytics/automationsFilter";
import { FilterCategoryNav } from "@app/components/workspace/analytics/filterPanel/FilterCategoryNav";
import { FilterFooter } from "@app/components/workspace/analytics/filterPanel/FilterFooter";
import { FilterOptionCheckboxList } from "@app/components/workspace/analytics/filterPanel/FilterOptionCheckboxList";
import { FilterSelectionSummary } from "@app/components/workspace/analytics/filterPanel/FilterSelectionSummary";
import { useAutomationsFilter } from "@app/components/workspace/analytics/useAutomationsFilter";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSearchMembers } from "@app/lib/swr/memberships";
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

const MEMBERS_PAGE_SIZE = 25;

const TYPE_OPTIONS: AutomationsFilterOption[] = [
  { id: "schedule", name: "Schedule", disabled: false, category: "type" },
  { id: "webhook", name: "Webhook", disabled: false, category: "type" },
];

interface AutomationsFilterPanelProps {
  owner: LightWorkspaceType;
  filter: AutomationsFilter;
  onFilterChange: (next: AutomationsFilter) => void;
}

export function AutomationsFilterPanel({
  owner,
  filter,
  onFilterChange,
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
    useState<AutomationsFilterCategory>("agent");
  const [searchText, setSearchText] = useState("");

  const isAgentCategoryActive = isOpen && activeCategory === "agent";
  const { agentConfigurations, isAgentConfigurationsLoading } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: isAgentCategoryActive ? "analytics" : null,
      sort: "alphabetical",
    });

  const isMemberCategoryActive = isOpen && activeCategory === "member";
  const { members, isLoading: isMembersLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: isMemberCategoryActive ? searchText : "",
    pageIndex: 0,
    pageSize: MEMBERS_PAGE_SIZE,
    disabled: !isMemberCategoryActive,
  });

  const categoryOptions = useMemo<
    Record<AutomationsFilterCategory, AutomationsFilterOption[]>
  >(
    () => ({
      agent: agentConfigurations.map((agent) => ({
        id: agent.sId,
        name: agent.name,
        disabled: false,
        image: agent.pictureUrl,
        category: "agent",
      })),
      member: members.map((member) => ({
        id: member.sId,
        name: member.fullName,
        disabled: false,
        image: member.image,
        category: "member",
      })),
      type: TYPE_OPTIONS,
    }),
    [agentConfigurations, members]
  );

  const isOptionsLoading =
    (activeCategory === "agent" && isAgentConfigurationsLoading) ||
    (activeCategory === "member" && isMembersLoading);

  const activeOptions = categoryOptions[activeCategory];
  // Member search is applied server-side; agent and type options are
  // filtered client-side against the small, already-fetched list.
  const filteredOptions = useMemo(() => {
    if (activeCategory === "member") {
      return activeOptions;
    }
    const search = searchText.trim().toLowerCase();
    return search
      ? activeOptions.filter((option) =>
          option.name.toLowerCase().includes(search)
        )
      : activeOptions;
  }, [activeOptions, activeCategory, searchText]);

  const selectedIdsForActiveCategory = useMemo(
    () =>
      new Set((draftFilter[activeCategory] ?? []).map((option) => option.id)),
    [draftFilter, activeCategory]
  );
  const unselectedOptions = filteredOptions.filter(
    (option) => !selectedIdsForActiveCategory.has(option.id)
  );
  const hasSelectableOptions =
    activeCategory !== "member" && unselectedOptions.length > 0;

  const appliedSelectionCount = automationsFilterSelectionCount(filter);
  const categoriesWithSelection = useMemo(
    () =>
      AUTOMATIONS_FILTER_CATEGORIES.filter(
        (category) => (draftFilter[category]?.length ?? 0) > 0
      ),
    [draftFilter]
  );
  const categorySelectionCounts = useMemo(() => {
    const counts: Partial<Record<AutomationsFilterCategory, number>> = {};
    for (const category of AUTOMATIONS_FILTER_CATEGORIES) {
      counts[category] = draftFilter[category]?.length ?? 0;
    }
    return counts;
  }, [draftFilter]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setDraftFilter(filter);
      setSearchText("");
    }
  };

  const handleCategoryChange = (category: AutomationsFilterCategory) => {
    setActiveCategory(category);
    setSearchText("");
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
            categories={AUTOMATIONS_FILTER_CATEGORIES}
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
              onChange={setSearchText}
              placeholder={`Search ${AUTOMATIONS_FILTER_CATEGORY_LABEL[activeCategory].toLowerCase()}`}
            />
            <FilterOptionCheckboxList
              key={`${isOpen}|${activeCategory}|${searchText}`}
              idPrefix={`automations-filter-option-${activeCategory}`}
              categoryLabel={AUTOMATIONS_FILTER_CATEGORY_LABEL[activeCategory]}
              options={filteredOptions}
              selectedIds={selectedIdsForActiveCategory}
              onToggleOption={(option) => toggleOption(activeCategory, option)}
              onSelectAll={() =>
                selectAllFiltered(activeCategory, unselectedOptions)
              }
              selectAllLabel="Select all"
              hasSelectableOptions={hasSelectableOptions}
              renderIcon={(option) => (
                <AutomationsFilterOptionIcon option={option} />
              )}
              isLoading={isOptionsLoading}
            />
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
