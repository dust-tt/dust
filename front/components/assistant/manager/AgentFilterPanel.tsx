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
import { Checkbox, InfoCircle, Label, Tooltip } from "@dust-tt/sparkle";
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
    searchType: "name",
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
      onClearAll={() => setDraftShowHiddenAgents(false)}
      facets={facets}
      isLoading={!!facet && isAgentsLoading}
      isError={!!facet && isAgentsError}
      idPrefix="agent-filter"
      categoryNavFooter={
        hiddenAgents && (
          <div className="flex items-center gap-2 p-2 pr-0">
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
            <Tooltip
              label="Shows the agents of all members you can access as an admin, even if they are not published or if they use restricted spaces"
              trigger={<InfoCircle className="h-4 w-4 text-muted-foreground" />}
            />
          </div>
        )
      }
    />
  );
}
