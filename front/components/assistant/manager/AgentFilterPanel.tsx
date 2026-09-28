import type {
  AgentFilter,
  AgentFilterCategory,
} from "@app/components/assistant/manager/agentFilter";
import {
  AGENT_FILTER_CATEGORY_FACET,
  toAgentSearchFilters,
} from "@app/components/assistant/manager/agentFilter";
import { clearFilterCategory } from "@app/components/shared/filter_panel/filterState";
import { SearchFilterPanel } from "@app/components/shared/filter_panel/SearchFilterPanel";
import type { SearchFilterOption } from "@app/components/shared/filter_panel/searchFilter";
import { useFilterPanel } from "@app/components/shared/filter_panel/useFilterPanel";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import type {
  AgentSearchFilters,
  AgentSearchPermissionFiltering,
} from "@app/types/agent_search/agent_search";
import type { LightWorkspaceType } from "@app/types/user";

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

export function AgentFilterPanel({
  owner,
  categories,
  searchTerm,
  tabFilters,
  permissionFiltering,
  filter,
  onFilterChange,
}: AgentFilterPanelProps) {
  const panel = useFilterPanel<AgentFilterCategory, SearchFilterOption>(
    filter,
    categories
  );
  const { isOpen, activeCategory, draftFilter } = panel;
  const facet = AGENT_FILTER_CATEGORY_FACET[activeCategory];
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
    facets: facet ? [facet] : [],
    disabled: !isOpen || !facet,
  });

  return (
    <SearchFilterPanel
      panel={panel}
      categories={categories}
      filter={filter}
      onFilterChange={onFilterChange}
      facets={facets}
      isLoading={!!facet && isAgentsLoading}
      isError={!!facet && isAgentsError}
      idPrefix="agent-filter"
    />
  );
}
