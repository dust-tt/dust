import type {
  AgentFilter,
  AgentFilterCategory,
  AgentFilterOption,
} from "@app/components/assistant/manager/agentFilter";
import {
  AGENT_ACCESS_FILTER_OPTIONS,
  AGENT_FILTER_CATEGORY_LABEL,
  getAgentModelDisplayName,
  toAgentSearchFilters,
} from "@app/components/assistant/manager/agentFilter";
import { FilterPanel } from "@app/components/shared/filter_panel/FilterPanel";
import { clearFilterCategory } from "@app/components/shared/filter_panel/filterState";
import { useFilterPanel } from "@app/components/shared/filter_panel/useFilterPanel";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import { useAuth } from "@app/lib/auth/AuthContext";
import type {
  AgentSearchFacet,
  AgentSearchFilters,
  AgentSearchPermissionFiltering,
} from "@app/types/agent_search/agent_search";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar } from "@dust-tt/sparkle";

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

const AGENT_FILTER_CATEGORY_FACET: Record<
  Exclude<AgentFilterCategory, "access">,
  AgentSearchFacet
> = {
  editor: "editors",
  model: "models",
  tag: "tags",
  space: "spaces",
};

function renderOptionIcon(option: AgentFilterOption) {
  return option.category === "editor" ? (
    <Avatar visual={option.image} name={option.name} size="xxs" isRounded />
  ) : null;
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
  const { user } = useAuth();
  const panel = useFilterPanel<AgentFilterCategory, AgentFilterOption>(
    filter,
    categories
  );
  const { isOpen, activeCategory, draftFilter } = panel;
  const isFacetCategory = activeCategory !== "access";
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
    facets: isFacetCategory
      ? [AGENT_FILTER_CATEGORY_FACET[activeCategory]]
      : [],
    disabled: !isOpen || !isFacetCategory,
  });

  const categoryOptions: Record<AgentFilterCategory, AgentFilterOption[]> = {
    access: AGENT_ACCESS_FILTER_OPTIONS,
    // The current user is listed first, as "Me".
    editor: (facets?.editors ?? [])
      .map(
        (editor): AgentFilterOption => ({
          category: "editor",
          id: editor.sId,
          name: editor.sId === user.sId ? "Me" : editor.fullName,
          image: editor.image,
          disabled: false,
        })
      )
      .toSorted(
        (a, b) => Number(b.id === user.sId) - Number(a.id === user.sId)
      ),
    model: (facets?.models ?? [])
      .map(
        ({ modelId }): AgentFilterOption => ({
          category: "model",
          id: modelId,
          name: getAgentModelDisplayName(modelId),
          disabled: false,
        })
      )
      .toSorted((a, b) => a.name.localeCompare(b.name)),
    tag: (facets?.tags ?? []).map((tag) => ({
      category: "tag",
      id: tag.sId,
      name: tag.name,
      disabled: false,
    })),
    space: (facets?.spaces ?? []).map((space) => ({
      category: "space",
      id: space.sId,
      name: space.kind === "global" ? GLOBAL_SPACE_NAME : space.name,
      disabled: false,
    })),
  };

  return (
    <FilterPanel
      panel={panel}
      categories={categories}
      categoryLabels={AGENT_FILTER_CATEGORY_LABEL}
      filter={filter}
      onFilterChange={onFilterChange}
      activeCategoryOptions={categoryOptions[activeCategory]}
      status={isFacetCategory && isAgentsLoading ? "loading" : "idle"}
      isError={isFacetCategory && isAgentsError}
      idPrefix="agent-filter"
      renderIcon={renderOptionIcon}
    />
  );
}
