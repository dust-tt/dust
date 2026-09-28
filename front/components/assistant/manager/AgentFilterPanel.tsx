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
import { Checkbox, Label } from "@dust-tt/sparkle";
import { useState } from "react";

interface AgentFilterPanelProps {
  owner: LightWorkspaceType;
  categories: readonly AgentFilterCategory[];
  searchTerm: string;
  // The tab's own filters: options are the values held by the agents the tab lists.
  tabFilters: AgentSearchFilters;
  permissionFiltering: AgentSearchPermissionFiltering;
  filter: AgentFilter;
  onFilterChange: (filter: AgentFilter) => void;
  // Offered only where admins may list hidden agents; checking it searches unrestricted.
  hiddenAgents?: {
    isShown: boolean;
    onChange: (isShown: boolean) => void;
  };
}

export function AgentFilterPanel({
  owner,
  categories,
  searchTerm,
  tabFilters,
  permissionFiltering,
  filter,
  onFilterChange,
  hiddenAgents,
}: AgentFilterPanelProps) {
  const panel = useFilterPanel<AgentFilterCategory, SearchFilterOption>(
    filter,
    categories
  );
  const { isOpen, activeCategory, draftFilter } = panel;
  const [draftShowHiddenAgents, setDraftShowHiddenAgents] = useState(
    hiddenAgents?.isShown ?? false
  );
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
    permissionFiltering: hiddenAgents
      ? draftShowHiddenAgents
        ? "unrestricted"
        : "strict"
      : permissionFiltering,
    facets: facet ? [facet] : [],
    disabled: !isOpen || !facet,
  });

  return (
    <SearchFilterPanel
      panel={panel}
      categories={categories}
      filter={filter}
      onFilterChange={(nextFilter) => {
        onFilterChange(nextFilter);
        hiddenAgents?.onChange(draftShowHiddenAgents);
      }}
      onOpen={() => setDraftShowHiddenAgents(hiddenAgents?.isShown ?? false)}
      facets={facets}
      isLoading={!!facet && isAgentsLoading}
      isError={!!facet && isAgentsError}
      idPrefix="agent-filter"
      categoryNavFooter={
        hiddenAgents && (
          <div className="flex items-center gap-1.5 py-1 pl-1 pr-2">
            <Checkbox
              id="agent-filter-hidden-agents"
              checked={draftShowHiddenAgents}
              onCheckedChange={(checked) =>
                setDraftShowHiddenAgents(checked === true)
              }
            />
            <Label
              htmlFor="agent-filter-hidden-agents"
              className="cursor-pointer text-sm leading-none"
            >
              Hidden agents
            </Label>
          </div>
        )
      }
    />
  );
}
