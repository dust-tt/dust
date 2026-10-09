import { AgentEditBar } from "@app/components/assistant/AgentEditBar";
import { CreateAgentDropdown } from "@app/components/assistant/CreateAgentDropdown";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import type { AgentFilter } from "@app/components/assistant/manager/agentFilter";
import {
  AGENT_FILTER_CATEGORIES,
  AGENT_FILTER_CATEGORY_FACET,
  AGENT_SEARCH_TAB_IDS,
  AGENT_SEARCH_TABS,
  toAgentSearchFilters,
} from "@app/components/assistant/manager/agentFilter";
import { AgentFilterPanel } from "@app/components/assistant/manager/AgentFilterPanel";
import { AgentSearchTable } from "@app/components/assistant/manager/AgentSearchTable";
import {
  ManageTrackingContext,
  trackManageDetails,
  useManageTracking,
  useTrackManageResults,
} from "@app/components/pages/builder/manageTracking";
import {
  clearFilterCategory,
  getFilterSummaries,
  selectAllFilterOptions,
} from "@app/components/shared/filter_panel/filterState";
import { FilterSummaryChips } from "@app/components/shared/filter_panel/FilterSummaryChips";
import {
  getSearchFilterCategorySingularLabels,
  getSearchFilterPresets,
} from "@app/components/shared/filter_panel/searchFilter";
import { useSearchPageHashState } from "@app/components/shared/filter_panel/searchFilterHash";
import {
  useSetContentWidth,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useTags } from "@app/lib/swr/tags";
import { tagsSorter } from "@app/lib/utils";
import type {
  AgentSearchFilters,
  AgentSearchPermissionFiltering,
  AgentSearchSort,
  AgentSearchSortOrder,
  SearchAgentsResponseBody,
} from "@app/types/agent_search/agent_search";
import { isString } from "@app/types/shared/utils/general";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  EmptyCTA,
  Page,
  SearchInput,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PaginationState } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

const AGENT_SEARCH_PAGE_SIZE = 25;

type SearchTabId = (typeof AGENT_SEARCH_TABS)[number]["id"];

interface AgentsListProps {
  isFilterLoading: boolean;
  readOnly?: boolean;
  searchEndpoint?: string;
  renderActions?: (agent: AgentSearchItem, onRefresh: () => void) => ReactNode;
  searchTerm: string;
  filters: AgentSearchFilters;
  permissionFiltering: AgentSearchPermissionFiltering;
  onSelect: (agentId: string) => void;
}

type AgentSearchItem = SearchAgentsResponseBody["agents"][number];

/**
 * @cc [owner:aubin-tchoi,label:product] editable-default-list
 * The editable Dust tab MUST include disabled default agents, using the same table
 * as custom agents. Read-only views MUST retain their search endpoint and expose no toggles.
 */
function AgentsList({
  isFilterLoading,
  readOnly = false,
  searchEndpoint,
  renderActions,
  searchTerm,
  filters,
  permissionFiltering,
  onSelect,
}: AgentsListProps) {
  const { t } = useLingui();
  const tracking = useManageTracking();
  const handleSelect = useCallback(
    (agentId: string) => {
      trackManageDetails(tracking, agentId);
      onSelect(agentId);
    },
    [tracking, onSelect]
  );
  const owner = useWorkspace();
  const { user, isAdmin } = useAuth();
  // Selected rows are kept by id across pages, with the item needed by batch actions.
  const [selectedAgents, setSelectedAgents] = useState<AgentSearchItem[]>([]);
  const { tags } = useTags({ owner, disabled: selectedAgents.length === 0 });
  const sortedTags = useMemo(() => [...tags].sort(tagsSorter), [tags]);
  const [tablePagination, setTablePagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: AGENT_SEARCH_PAGE_SIZE,
  });
  const [selectedSort, setSelectedSort] = useState<{
    sortBy: Exclude<AgentSearchSort, "relevance">;
    sortOrder: AgentSearchSortOrder;
  } | null>(null);
  const sortBy =
    selectedSort?.sortBy ?? (searchTerm.trim() ? "relevance" : "usage");
  const sortOrder = selectedSort?.sortOrder;
  const queryKey = JSON.stringify({
    searchTerm,
    filters,
    permissionFiltering,
    sortBy,
    sortOrder,
  });
  const [previousQueryKey, setPreviousQueryKey] = useState(queryKey);

  if (queryKey !== previousQueryKey) {
    setPreviousQueryKey(queryKey);
    setTablePagination({ pageIndex: 0, pageSize: AGENT_SEARCH_PAGE_SIZE });
    setSelectedAgents([]);
  }

  const {
    agents,
    total,
    isAgentsLoading,
    isAgentsError,
    isAgentsValidating,
    mutate,
  } = useSearchAgents({
    owner,
    searchEndpoint,
    searchTerm,
    searchType: "name",
    filters,
    permissionFiltering,
    offset: tablePagination.pageIndex * AGENT_SEARCH_PAGE_SIZE,
    limit: AGENT_SEARCH_PAGE_SIZE,
    sortBy,
    sortOrder,
  });

  useTrackManageResults({
    queryKey,
    searchTerm,
    total,
    disabled:
      isFilterLoading ||
      isAgentsLoading ||
      isAgentsError ||
      tablePagination.pageIndex !== 0,
  });

  // Batch edits are reserved to the agent's editors and to workspace admins, as on the legacy page.
  const canSelect = useCallback(
    (agent: AgentSearchItem) =>
      !readOnly &&
      agent.scope !== "global" &&
      agent.status !== "archived" &&
      (isAdmin || agent.editorIds.includes(user.sId)),
    [isAdmin, user.sId, readOnly]
  );

  // Prefer the freshly loaded row so batch actions see the agent's current tags.
  const currentSelectedAgents = selectedAgents.map(
    (selected) => agents.find((agent) => agent.sId === selected.sId) ?? selected
  );

  const setSelectedAgentIds = (agentIds: string[]) => {
    const knownAgents = new Map(
      [...currentSelectedAgents, ...agents].map((agent) => [agent.sId, agent])
    );
    setSelectedAgents(
      agentIds.flatMap((agentId) => knownAgents.get(agentId) ?? [])
    );
  };

  const clearSelectionAndRefresh = () => {
    setSelectedAgents([]);
    void mutate();
  };

  return (
    <div className="flex flex-col gap-4">
      {isAgentsError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 py-4"
        >
          <span>
            <Trans>Could not load agents. Please try again.</Trans>
          </span>
          <Button
            label={t`Retry`}
            variant="outline"
            isLoading={isAgentsValidating}
            disabled={isAgentsValidating}
            onClick={() => void mutate()}
          />
        </div>
      )}
      {!isAgentsError &&
      (isAgentsLoading ||
        agents.length > 0 ||
        tablePagination.pageIndex > 0) ? (
        <AgentSearchTable
          owner={owner}
          readOnly={readOnly}
          renderActions={renderActions}
          agents={agents}
          onSelect={handleSelect}
          onRefresh={mutate}
          pagination={tablePagination}
          // The table reports its pagination on every render; storing an unchanged value would
          // re-render forever.
          setPagination={(next) => {
            if (
              next.pageIndex !== tablePagination.pageIndex ||
              next.pageSize !== tablePagination.pageSize
            ) {
              setTablePagination(next);
            }
          }}
          total={total}
          sorting={
            sortBy === "relevance"
              ? []
              : [{ id: sortBy, desc: sortOrder !== "asc" }]
          }
          setSorting={([sort]) => {
            switch (sort?.id) {
              case "name":
              case "usage":
              case "updatedAt":
                setSelectedSort({
                  sortBy: sort.id,
                  sortOrder: sort.desc ? "desc" : "asc",
                });
                break;
              default:
                setSelectedSort(null);
            }
          }}
          isLoading={isAgentsLoading}
          selectedAgentIds={selectedAgents.map((agent) => agent.sId)}
          setSelectedAgentIds={setSelectedAgentIds}
          canSelect={canSelect}
        />
      ) : !isAgentsError ? (
        <EmptyCTA
          message={
            searchTerm.trim()
              ? t`No agents match your search.`
              : t`No agents to show.`
          }
          action={null}
        />
      ) : null}
      {!readOnly && (
        <AgentEditBar
          owner={owner}
          selectedAgents={currentSelectedAgents}
          tags={sortedTags}
          mutateAgentConfigurations={mutate}
          // Search results carry no total, so selection is extended one page at a time.
          totalCount={selectedAgents.length}
          onSelectAll={() => undefined}
          onClear={clearSelectionAndRefresh}
        />
      )}
    </div>
  );
}

interface ManageAgentsPageProps {
  readOnly?: boolean;
  showHeader?: boolean;
  searchEndpoint?: string;
  filterHashParam?: string;
  permissionFiltering?: AgentSearchPermissionFiltering;
  searchActions?: ReactNode;
  onSelect?: (agentId: string) => void;
  renderActions?: (agent: AgentSearchItem, onRefresh: () => void) => ReactNode;
}

/**
 * @cc [owner:aubin-tchoi,label:product;react] read-only-search-view
 * In readOnly mode, built-in creation, batch-edit and detail controls MUST NOT render.
 * Table and facet requests MUST use the same searchEndpoint when supplied.
 */
/**
 * @cc [owner:aubin-tchoi,label:product] default-agent-management
 * The editable Dust tab MUST include disabled default agents and allow only workspace
 * admins to change their status. Read-only views MUST NOT expose mutation controls.
 * Only visible filter categories may constrain results and facets; hidden selections remain
 * available when switching back to a tab that supports them.
 */
export function ManageAgentsPage({
  readOnly = false,
  showHeader = true,
  searchEndpoint,
  filterHashParam,
  permissionFiltering: permissionFilteringOverride,
  searchActions,
  onSelect,
  renderActions,
}: ManageAgentsPageProps) {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { user, isAdmin } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const [detailedAgentId, setDetailedAgentId] = useHashParam("agentId");
  const [searchTerm, setSearchTerm] = useState("");
  const [hiddenAgentsParam, setHiddenAgentsParam] =
    useHashParam("hiddenAgents");
  const showHiddenAgents = hiddenAgentsParam === "true";
  const setShowHiddenAgents = (isShown: boolean) =>
    setHiddenAgentsParam(isShown ? "true" : undefined);
  const {
    selectedTab,
    setSelectedTab,
    filter: pendingFilter,
    setFilter,
    unresolvedCategories,
    resolveFilter,
  } = useSearchPageHashState({
    categories: AGENT_FILTER_CATEGORIES,
    tabIds: AGENT_SEARCH_TAB_IDS,
    defaultTabId: "all",
    hashParam: filterHashParam,
  });
  // Default agents all share the global scope, so Access does not apply to them.
  // They have no usage either, so Usage does not apply to them.
  const filterCategories = AGENT_FILTER_CATEGORIES.filter(
    (category) =>
      selectedTab !== "default" ||
      (readOnly
        ? category !== "access" && category !== "usage"
        : category === "model")
  );
  const unresolvedVisibleCategories = unresolvedCategories.filter((category) =>
    filterCategories.includes(category)
  );
  const activeTab =
    AGENT_SEARCH_TABS.find((tab) => tab.id === selectedTab) ??
    AGENT_SEARCH_TABS[0];
  const canShowHiddenAgents =
    permissionFilteringOverride === undefined &&
    isAdmin &&
    selectedTab === "all";
  useSetContentWidth("wide");
  useSetPageTitle(t`Dust - Manage agents`);

  // Only admins may list the agents they neither edit nor share a space with. Archived agents
  // are listed unrestricted for admins, as in the legacy page.
  const getPermissionFiltering = (
    tabId: SearchTabId
  ): AgentSearchPermissionFiltering =>
    permissionFilteringOverride ??
    (isAdmin && ((tabId === "all" && showHiddenAgents) || tabId === "archived")
      ? "unrestricted"
      : "strict");
  // Names of the selections restored from a link come from the agents they match.
  const { facets: selectionFacets, isAgentsLoading: isSelectionLoading } =
    useSearchAgents({
      owner,
      searchEndpoint,
      searchTerm: "",
      searchType: "name",
      limit: 0,
      filters: toAgentSearchFilters(
        Object.fromEntries(
          filterCategories.map((category) => [
            category,
            pendingFilter[category],
          ])
        ),
        activeTab.filters
      ),
      permissionFiltering: getPermissionFiltering(activeTab.id),
      facets: unresolvedVisibleCategories.flatMap(
        (category) => AGENT_FILTER_CATEGORY_FACET[category] ?? []
      ),
      disabled: unresolvedVisibleCategories.length === 0,
    });
  const filter = resolveFilter(selectionFacets);
  const visibleFilter: AgentFilter = Object.fromEntries(
    filterCategories.map((category) => [category, filter[category]])
  );

  const searchInput = (
    <div className="w-full md:w-1/2">
      <label htmlFor="agent-search" className="sr-only">
        <Trans>Search agents</Trans>
      </label>
      <SearchInput
        id="agent-search"
        name="agent-search"
        placeholder={t`Search for agents`}
        value={searchTerm}
        onChange={setSearchTerm}
        className="w-full"
      />
    </div>
  );

  const tracking = useMemo(
    () =>
      readOnly ? null : { entity_type: "agent" as const, tab: selectedTab },
    [readOnly, selectedTab]
  );

  return (
    <ManageTrackingContext.Provider value={tracking}>
      <div className="flex w-full flex-col gap-6 pb-4">
        {showHeader && (
          <Page.Header
            title={
              <div className="flex w-full flex-wrap items-center justify-between gap-4">
                <Page.H>
                  <Trans>Manage agents</Trans>
                </Page.H>
                {!readOnly && hasPermission("create", "agent") && (
                  <CreateAgentDropdown
                    owner={owner}
                    dataGtmLocation="assistantsWorkspace"
                  />
                )}
              </div>
            }
            description={t`Build and manage agents that work with your team's knowledge and tools.`}
            noTopPadding
          />
        )}
        {searchActions ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            {searchInput}
            {searchActions}
          </div>
        ) : (
          searchInput
        )}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <ButtonsSwitchList
              value={selectedTab}
              onValueChange={(value) => {
                const tab = AGENT_SEARCH_TABS.find(({ id }) => id === value);
                if (tab) {
                  setSelectedTab(tab.id);
                }
              }}
            >
              {AGENT_SEARCH_TABS.map((tab) => (
                <ButtonsSwitch
                  key={tab.id}
                  value={tab.id}
                  label={isString(tab.label) ? tab.label : t(tab.label)}
                />
              ))}
            </ButtonsSwitchList>
            <AgentFilterPanel
              owner={owner}
              searchEndpoint={searchEndpoint}
              categories={filterCategories}
              searchTerm={searchTerm}
              tabFilters={activeTab.filters}
              permissionFiltering={getPermissionFiltering(activeTab.id)}
              filter={visibleFilter}
              onFilterChange={(nextFilter) =>
                setFilter({
                  ...filter,
                  ...Object.fromEntries(
                    filterCategories.map((category) => [
                      category,
                      nextFilter[category],
                    ])
                  ),
                })
              }
              hiddenAgents={
                canShowHiddenAgents
                  ? {
                      isShown: showHiddenAgents,
                      onChange: setShowHiddenAgents,
                    }
                  : undefined
              }
            />
          </div>
          <FilterSummaryChips
            isLoading={isSelectionLoading}
            summaries={getFilterSummaries(
              visibleFilter,
              filterCategories,
              getSearchFilterCategorySingularLabels(t)
            )}
            onClearCategory={(category) =>
              setFilter(clearFilterCategory(filter, category))
            }
            presets={getSearchFilterPresets({
              categories: filterCategories,
              currentUser: user,
              t,
            })}
            onApplyPreset={(preset) =>
              setFilter(
                selectAllFilterOptions(filter, preset.category, preset.options)
              )
            }
            extraChips={
              canShowHiddenAgents && showHiddenAgents
                ? [
                    {
                      key: "hidden-agents",
                      label: (
                        <span className="min-w-0 truncate text-xs font-bold">
                          <Trans>Hidden agents</Trans>
                        </span>
                      ),
                      onRemove: () => setShowHiddenAgents(false),
                    },
                  ]
                : []
            }
            onClearAll={() => {
              setFilter({
                ...filter,
                ...Object.fromEntries(
                  filterCategories.map((category) => [category, undefined])
                ),
              });
              setShowHiddenAgents(false);
            }}
          />
          <AgentsList
            isFilterLoading={isSelectionLoading}
            readOnly={readOnly}
            searchEndpoint={searchEndpoint}
            renderActions={renderActions}
            key={`${owner.sId}-${activeTab.id}`}
            searchTerm={searchTerm}
            filters={toAgentSearchFilters(visibleFilter, activeTab.filters)}
            permissionFiltering={getPermissionFiltering(activeTab.id)}
            onSelect={onSelect ?? setDetailedAgentId}
          />
        </div>
      </div>
      {!readOnly && (
        <AgentDetailsSheet
          owner={owner}
          user={user}
          agentId={detailedAgentId ?? null}
          onClose={() => setDetailedAgentId(undefined)}
        />
      )}
    </ManageTrackingContext.Provider>
  );
}
