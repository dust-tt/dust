import { getModelEffortTier } from "@app/components/model_picker/modelPickerUtils";
import type {
  UsageFilter,
  UsageFilterAgentOption,
  UsageFilterCategory,
  UsageFilterGroup,
  UsageFilterMemberOption,
  UsageFilterModelOption,
  UsageFilterOptionForCategory,
  UsageFilterSkillOption,
  UsageFilterSourceOption,
  UsageFilterTeamOption,
  UsageFilterToolOption,
  UsageModelTier,
} from "@app/components/workspace/analytics/usageFilter";
import {
  USAGE_FILTER_CATEGORIES,
  USAGE_FILTER_CATEGORY_LABEL,
  USAGE_MODEL_TIERS,
  usageModelTierFromModelsTierName,
} from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterAgentScopeControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterAgentScopeControls";
import { UsageFilterCategoryNav } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterCategoryNav";
import { UsageFilterFooter } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterFooter";
import { UsageFilterMemberGroupsControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterMemberGroupsControls";
import { UsageFilterModelComplexityControls } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterModelComplexityControls";
import { UsageFilterOptionCheckboxList } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterOptionCheckboxList";
import { UsageFilterSelectionSummary } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterSelectionSummary";
import { useUsageFilter } from "@app/components/workspace/analytics/useUsageFilter";
import { useToggleSelectionList } from "@app/hooks/useToggleSelectionList";
import {
  getMcpServerDisplayName,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useGroups } from "@app/lib/swr/groups";
import { useMCPServers } from "@app/lib/swr/mcp_servers";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useModels } from "@app/lib/swr/models";
import { useSkills } from "@app/lib/swr/skill_configurations";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { AGENT_CONFIGURATION_SCOPES } from "@app/types/assistant/agent";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getModelMaker } from "@app/types/assistant/models/providers";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
import { useCallback, useEffect, useMemo, useState } from "react";

// Chunk size for the infinite scroll
const FILTER_PICKER_PAGE_SIZE = 100;

interface UsageFilterPaginationState {
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

interface UsageFilterPanelProps {
  owner: LightWorkspaceType;
  // Sources are still mock data (see usageFilterMockData.ts — fake
  // connectors standing in for a real db call); agents come from
  // useAgentConfigurations, members from useSearchMembers, teams from
  // useGroups, models from the workspace's full model catalog (useModels),
  // tools from the workspace's full MCP server catalog (useMCPServers), and
  // skills from the workspace's full skill catalog (useSkills) — the same
  // endpoints that back the model, tool, and skill pickers elsewhere in the
  // app.
  categoryOptions: {
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
  const [activeScope, setActiveScope] = useState<AgentConfigurationScope>(
    AGENT_CONFIGURATION_SCOPES[0]
  );
  const [activeTier, setActiveTier] = useState<UsageModelTier>(
    USAGE_MODEL_TIERS[0]
  );
  const [searchText, setSearchText] = useState("");
  // Only used for the "member" category: narrows the displayed members down
  // to those belonging to at least one of these groups.
  const selectedGroups = useToggleSelectionList<UsageFilterGroup>();

  const isMemberCategoryActive = isOpen && activeCategory === "member";
  const isTeamCategoryActive = isOpen && activeCategory === "team";
  const isAgentCategoryActive = isOpen && activeCategory === "agent";
  const isModelCategoryActive = isOpen && activeCategory === "model";
  const isToolCategoryActive = isOpen && activeCategory === "tool";
  const isSkillCategoryActive = isOpen && activeCategory === "skill";

  // Every category picker supports scroll-to-load-more:
  const [memberPageIndex, setMemberPageIndex] = useState(0);
  const [accumulatedMemberOptions, setAccumulatedMemberOptions] = useState<
    UsageFilterMemberOption[]
  >([]);
  const [visibleStaticCount, setVisibleStaticCount] = useState(
    FILTER_PICKER_PAGE_SIZE
  );

  const resetFilterPickerPagination = useCallback(() => {
    setMemberPageIndex(0);
    setVisibleStaticCount(FILTER_PICKER_PAGE_SIZE);
  }, []);

  // Search is applied server-side by useSearchMembers, same as the sibling
  // AnalyticsFilterDropdown's member picker.
  const {
    members: searchedMembers,
    totalMembersCount,
    isMembersValidating,
  } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: memberPageIndex,
    pageSize: FILTER_PICKER_PAGE_SIZE,
    disabled: !isMemberCategoryActive,
  });

  useEffect(() => {
    const page = searchedMembers.map((member) => ({
      id: member.sId,
      name: member.fullName,
      kind: "member" as const,
      image: member.image,
    }));
    if (memberPageIndex === 0) {
      setAccumulatedMemberOptions(page);
      return;
    }
    if (page.length === 0) {
      return;
    }
    setAccumulatedMemberOptions((prev) => {
      const existingIds = new Set(prev.map((option) => option.id));
      const newOptions = page.filter((option) => !existingIds.has(option.id));
      return newOptions.length > 0 ? [...prev, ...newOptions] : prev;
    });
  }, [searchedMembers, memberPageIndex]);

  // Whether more members exist server-side, independent of the client-side
  // group filter below — scrolling must keep fetching even if the current
  // group filter narrows the visible list to fewer than a full page.
  const hasMoreMembers = accumulatedMemberOptions.length < totalMembersCount;

  const handleLoadMoreMembers = useCallback(() => {
    if (isMembersValidating || !hasMoreMembers) {
      return;
    }
    setMemberPageIndex((current) => current + 1);
  }, [isMembersValidating, hasMoreMembers]);

  const handleLoadMoreStaticOptions = useCallback(() => {
    setVisibleStaticCount((current) => current + FILTER_PICKER_PAGE_SIZE);
  }, []);

  const { groups: workspaceGroups } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    withMembers: true,
    disabled: !isMemberCategoryActive && !isTeamCategoryActive,
  });

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "all",
    disabled: !isAgentCategoryActive,
  });

  const { mcpServers } = useMCPServers({
    owner,
    disabled: !isToolCategoryActive,
  });

  const { skills: skillCatalog } = useSkills({
    owner,
    status: "active",
    disabled: !isSkillCategoryActive,
  });

  // The workspace's full, period-independent model catalog — the same
  // endpoint backing the model picker elsewhere in the app — rather than a
  // period-scoped top-N, so every enabled model is listable and searchable
  // regardless of the selected period.
  const { models: modelCatalog } = useModels({
    owner,
    disabled: !isModelCategoryActive,
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

  const teamOptions = useMemo<UsageFilterTeamOption[]>(
    () =>
      workspaceGroups.map((group) => ({
        id: group.sId,
        name: group.name,
        kind: "team",
      })),
    [workspaceGroups]
  );

  const agentOptions = useMemo<UsageFilterAgentOption[]>(
    () =>
      agentConfigurations.map((agent) => ({
        id: agent.sId,
        name: agent.name,
        kind: "agent",
        image: agent.pictureUrl,
        scope: agent.scope,
      })),
    [agentConfigurations]
  );

  // Every enabled model in the workspace, regardless of the selected period.
  // Excludes the auto/meta stream ids (Fast/Standard/Complex are exposed as
  // the quick-filter tier buttons, not as catalog entries). Search is
  // applied client-side below; tier is derived from the same static table
  // ModelsTierResource.getTierForModel resolves server-side.
  const modelCatalogOptions = useMemo<UsageFilterModelOption[]>(
    () =>
      modelCatalog
        .filter((model) => !isModelStreamId(model.modelId))
        .map((model) => ({
          id: model.modelId,
          name: model.displayName,
          kind: "model" as const,
          lab: getModelMaker(model),
          tier: usageModelTierFromModelsTierName(
            getModelEffortTier(model.modelId, model.defaultReasoningEffort)
          ),
        })),
    [modelCatalog]
  );

  const toolOptions = useMemo<UsageFilterToolOption[]>(
    () =>
      mcpServers.map((server) => ({
        id: isRemoteMCPServerType(server) ? server.sId : server.name,
        name: getMcpServerDisplayName(server),
        kind: "tool" as const,
      })),
    [mcpServers]
  );

  const skillOptions = useMemo<UsageFilterSkillOption[]>(
    () =>
      skillCatalog.map((skill) => ({
        id: skill.sId,
        name: skill.name,
        kind: "skill" as const,
      })),
    [skillCatalog]
  );

  const resolvedCategoryOptions = useMemo<{
    [C in UsageFilterCategory]: UsageFilterOptionForCategory<C>[];
  }>(
    () => ({
      ...categoryOptions,
      member: accumulatedMemberOptions,
      team: teamOptions,
      agent: agentOptions,
      model: modelCatalogOptions,
      tool: toolOptions,
      skill: skillOptions,
    }),
    [
      categoryOptions,
      accumulatedMemberOptions,
      teamOptions,
      agentOptions,
      modelCatalogOptions,
      toolOptions,
      skillOptions,
    ]
  );

  const activeOptions = resolvedCategoryOptions[activeCategory];
  const filteredOptions = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const selectedGroupMemberIds =
      activeCategory === "member" && selectedGroups.items.length > 0
        ? new Set(selectedGroups.items.flatMap((group) => group.memberIds))
        : null;
    const matchingOptions = activeOptions.filter((option) => {
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
    return matchingOptions;
  }, [
    activeOptions,
    searchText,
    activeScope,
    activeTier,
    activeCategory,
    selectedGroups.items,
  ]);

  // Members are already paginated server-side into filteredOptions; the
  // other categories reveal a growing window of the already-loaded
  // filteredOptions as the user scrolls.
  const displayedOptions = useMemo(
    () =>
      activeCategory === "member"
        ? filteredOptions
        : filteredOptions.slice(0, visibleStaticCount),
    [filteredOptions, activeCategory, visibleStaticCount]
  );

  const hasMoreStaticOptions =
    activeCategory !== "member" && visibleStaticCount < filteredOptions.length;

  const activePagination = useMemo<UsageFilterPaginationState>(() => {
    switch (activeCategory) {
      case "member":
        return {
          hasMore: hasMoreMembers,
          isLoadingMore: isMembersValidating,
          onLoadMore: handleLoadMoreMembers,
        };
      case "agent":
      case "team":
      case "model":
      case "tool":
      case "skill":
      case "source":
        return {
          hasMore: hasMoreStaticOptions,
          isLoadingMore: false,
          onLoadMore: handleLoadMoreStaticOptions,
        };
      default:
        return assertNever(activeCategory);
    }
  }, [
    activeCategory,
    hasMoreMembers,
    isMembersValidating,
    handleLoadMoreMembers,
    hasMoreStaticOptions,
    handleLoadMoreStaticOptions,
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
      selectedGroups.setItems([]);
      resetFilterPickerPagination();
    }
  };

  const handleCategoryChange = (category: UsageFilterCategory) => {
    setActiveCategory(category);
    setSearchText("");
    resetFilterPickerPagination();
  };

  const handleSearchTextChange = (text: string) => {
    setSearchText(text);
    resetFilterPickerPagination();
  };

  // Category-specific "active option" controls (scope, tier, ...) all need
  // to reset pagination on change; wrap their setters once instead of
  // writing a dedicated handleXxxChange per category.
  const withPaginationReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      resetFilterPickerPagination();
    };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleApply = () => {
    onFilterChange(draftFilter);
    setIsOpen(false);
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
              onChange={handleSearchTextChange}
              placeholder={`Search ${USAGE_FILTER_CATEGORY_LABEL[activeCategory].toLowerCase()}`}
            />
            {activeCategory === "member" && (
              <UsageFilterMemberGroupsControls
                groups={groups}
                selectedGroups={selectedGroups.items}
                onAddGroup={selectedGroups.add}
                onRemoveGroup={selectedGroups.remove}
              />
            )}
            {activeCategory === "model" && (
              <UsageFilterModelComplexityControls
                moreModelsCatalog={modelCatalogOptions}
                selectedModelIds={selectedIdsForActiveCategory}
                onToggleModel={(model) => toggleOption("model", model)}
                activeTier={activeTier}
                onTierChange={withPaginationReset(setActiveTier)}
              />
            )}
            {activeCategory === "agent" && (
              <UsageFilterAgentScopeControls
                activeScope={activeScope}
                onScopeChange={withPaginationReset(setActiveScope)}
              />
            )}
            <UsageFilterOptionCheckboxList
              category={activeCategory}
              categoryLabel={USAGE_FILTER_CATEGORY_LABEL[activeCategory]}
              options={displayedOptions}
              selectedIds={selectedIdsForActiveCategory}
              onToggleOption={(option) => toggleOption(activeCategory, option)}
              onSelectAll={() =>
                selectAllFiltered(activeCategory, filteredOptions)
              }
              hasMore={activePagination.hasMore}
              isLoadingMore={activePagination.isLoadingMore}
              onLoadMore={activePagination.onLoadMore}
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
