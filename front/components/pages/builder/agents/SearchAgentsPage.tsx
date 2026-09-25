import { AgentEditBar } from "@app/components/assistant/AgentEditBar";
import { CreateAgentDropdown } from "@app/components/assistant/CreateAgentDropdown";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { AgentFilterPanel } from "@app/components/assistant/manager/AgentFilterPanel";
import { AgentSearchTable } from "@app/components/assistant/manager/AgentSearchTable";
import type { AgentFilter } from "@app/components/assistant/manager/agentFilter";
import {
  AGENT_FILTER_CATEGORIES,
  AGENT_FILTER_CATEGORY_SINGULAR_LABEL,
  toAgentSearchFilters,
} from "@app/components/assistant/manager/agentFilter";
import { FilterSummaryChips } from "@app/components/shared/filter_panel/FilterSummaryChips";
import {
  clearFilterCategory,
  getFilterSummaries,
} from "@app/components/shared/filter_panel/filterState";
import {
  useSetContentWidth,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
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
import {
  Button,
  Checkbox,
  EmptyCTA,
  InfoCircle,
  Page,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import { useMemo, useState } from "react";

const AGENT_SEARCH_PAGE_SIZE = 25;

const SEARCH_TABS = [
  {
    id: "all",
    label: "All",
    filters: { status: ["active"], scope: ["visible", "hidden"] },
  },
  {
    id: "editable_by_me",
    label: "Editable by me",
    filters: { status: ["active"], editedByMe: true },
  },
  {
    id: "default",
    label: "Default",
    filters: { status: ["active"], scope: ["global"] },
  },
  { id: "archived", label: "Archived", filters: { status: ["archived"] } },
] satisfies { id: string; label: string; filters: AgentSearchFilters }[];

type SearchTabId = (typeof SEARCH_TABS)[number]["id"];

interface AgentsListProps {
  searchTerm: string;
  filters: AgentSearchFilters;
  permissionFiltering: AgentSearchPermissionFiltering;
  onSelect: (agentId: string) => void;
}

type AgentSearchItem = SearchAgentsResponseBody["agents"][number];

function AgentsList({
  searchTerm,
  filters,
  permissionFiltering,
  onSelect,
}: AgentsListProps) {
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
    searchTerm,
    filters,
    permissionFiltering,
    offset: tablePagination.pageIndex * AGENT_SEARCH_PAGE_SIZE,
    limit: AGENT_SEARCH_PAGE_SIZE,
    sortBy,
    sortOrder,
  });

  // Batch edits are reserved to the agent's editors and to workspace admins, as on the legacy page.
  const canSelect = (agent: AgentSearchItem) =>
    agent.scope !== "global" &&
    agent.status !== "archived" &&
    (isAdmin || agent.editorIds.includes(user.sId));

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
          <span>Could not load agents. Please try again.</span>
          <Button
            label="Retry"
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
          agents={agents}
          onSelect={onSelect}
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
              ? "No agents match your search."
              : "No agents to show."
          }
          action={null}
        />
      ) : null}
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
    </div>
  );
}

export function SearchAgentsPage() {
  const owner = useWorkspace();
  const { user, isAdmin } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const [detailedAgentId, setDetailedAgentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState<SearchTabId>("all");
  const [showHiddenAgents, setShowHiddenAgents] = useState(false);
  const [filter, setFilter] = useState<AgentFilter>({});
  // Default agents all share the global scope, so Access does not apply to them.
  const filterCategories = AGENT_FILTER_CATEGORIES.filter(
    (category) => selectedTab !== "default" || category !== "access"
  );
  const activeTab =
    SEARCH_TABS.find((tab) => tab.id === selectedTab) ?? SEARCH_TABS[0];
  useSetContentWidth("wide");
  useSetPageTitle("Dust - Manage Agents");

  // Only admins may list the agents they neither edit nor share a space with. Archived agents
  // are listed unrestricted for admins, as in the legacy page.
  const getPermissionFiltering = (
    tabId: SearchTabId
  ): AgentSearchPermissionFiltering =>
    isAdmin && ((tabId === "all" && showHiddenAgents) || tabId === "archived")
      ? "unrestricted"
      : "strict";

  return (
    <>
      <div className="flex w-full flex-col gap-6 pb-4">
        <Page.Header
          title={
            <div className="flex w-full flex-wrap items-center justify-between gap-4">
              <Page.H>Manage Agents</Page.H>
              {hasPermission("create", "agent") && (
                <CreateAgentDropdown
                  owner={owner}
                  dataGtmLocation="assistantsWorkspace"
                />
              )}
            </div>
          }
          noTopPadding
        />
        <div className="w-full">
          <label htmlFor="agent-search" className="sr-only">
            Search agents
          </label>
          <SearchInput
            id="agent-search"
            name="agent-search"
            placeholder="Search agents by name"
            value={searchTerm}
            onChange={setSearchTerm}
            className="w-full"
          />
        </div>
        <Tabs
          value={selectedTab}
          onValueChange={(value) => {
            const tab = SEARCH_TABS.find(({ id }) => id === value);
            if (tab) {
              setSelectedTab(tab.id);
            }
          }}
        >
          <TabsList>
            {SEARCH_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} label={tab.label} />
            ))}
            <div className="grow" />
            {isAdmin && selectedTab === "all" && (
              <span className="flex gap-1 self-center text-sm text-muted-foreground">
                <label className="flex cursor-pointer flex-row items-center gap-2 whitespace-nowrap">
                  <Checkbox
                    checked={showHiddenAgents}
                    onCheckedChange={(checked) =>
                      setShowHiddenAgents(checked === true)
                    }
                  />
                  Show hidden agents
                </label>
                <Tooltip
                  label="Shows the agents of all members you can access as an admin, even if they are not published or if they use restricted spaces"
                  trigger={
                    <InfoCircle className="h-4 w-4 text-muted-foreground" />
                  }
                />
              </span>
            )}
            <div className="flex items-center">
              <AgentFilterPanel
                owner={owner}
                categories={filterCategories}
                tabFilters={activeTab.filters}
                permissionFiltering={getPermissionFiltering(activeTab.id)}
                filter={filter}
                onFilterChange={setFilter}
              />
            </div>
          </TabsList>
          <FilterSummaryChips
            summaries={getFilterSummaries(
              filter,
              filterCategories,
              AGENT_FILTER_CATEGORY_SINGULAR_LABEL
            )}
            onClearCategory={(category) =>
              setFilter(clearFilterCategory(filter, category))
            }
            onClearAll={() => setFilter({})}
          />
          {SEARCH_TABS.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              <AgentsList
                key={owner.sId}
                searchTerm={searchTerm}
                filters={toAgentSearchFilters(filter, tab.filters)}
                permissionFiltering={getPermissionFiltering(tab.id)}
                onSelect={setDetailedAgentId}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={detailedAgentId}
        onClose={() => setDetailedAgentId(null)}
      />
    </>
  );
}
