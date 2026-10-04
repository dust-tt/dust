import type { SearchFilter } from "@app/components/shared/filter_panel/searchFilter";
import {
  getSearchFilterActiveUsersCount,
  getSearchFilterIds,
  getSearchFilterMcpServerViewIds,
} from "@app/components/shared/filter_panel/searchFilter";
import type {
  AgentSearchFacet,
  AgentSearchFilters,
} from "@app/types/agent_search/agent_search";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";

export const AGENT_FILTER_CATEGORIES = [
  "access",
  "editor",
  "model",
  "skill",
  "tool",
  "tag",
  "space",
  "usage",
] as const;

export type AgentFilterCategory = (typeof AGENT_FILTER_CATEGORIES)[number];

export type AgentFilter = SearchFilter<AgentFilterCategory>;

// Access options are static, so it has no facet.
export const AGENT_FILTER_CATEGORY_FACET: Partial<
  Record<AgentFilterCategory, AgentSearchFacet>
> = {
  editor: "editors",
  model: "models",
  skill: "skills",
  tool: "mcpServerViews",
  tag: "tags",
  space: "spaces",
  usage: "usage",
};

const AGENT_ACCESS_SCOPES: AgentConfigurationScope[] = ["visible", "hidden"];

// Access narrows the tab's scope and is ignored where it cannot apply (the Dust tab); the other
// categories add their own filter.
export function toAgentSearchFilters(
  filter: AgentFilter,
  tabFilters: AgentSearchFilters
): AgentSearchFilters {
  const access = getSearchFilterIds(filter, "access");
  const scope =
    access.length > 0
      ? (tabFilters.scope ?? AGENT_ACCESS_SCOPES).filter((tabScope) =>
          access.some((selected) => selected === tabScope)
        )
      : [];
  const editorIds = getSearchFilterIds(filter, "editor");
  const modelIds = getSearchFilterIds(filter, "model");
  const skillIds = getSearchFilterIds(filter, "skill");
  const mcpServerViewIds = getSearchFilterMcpServerViewIds(filter);
  const tagIds = getSearchFilterIds(filter, "tag");
  const spaceIds = getSearchFilterIds(filter, "space");
  // Default agents have no usage, so Usage is ignored on the Dust tab too.
  const activeUsersCount = tabFilters.scope?.every(
    (tabScope) => tabScope === "global"
  )
    ? undefined
    : getSearchFilterActiveUsersCount(filter);

  return {
    ...tabFilters,
    ...(scope.length > 0 ? { scope } : {}),
    ...(editorIds.length > 0 ? { editorIds } : {}),
    ...(modelIds.length > 0 ? { modelIds } : {}),
    ...(skillIds.length > 0 ? { skillIds } : {}),
    ...(mcpServerViewIds.length > 0 ? { mcpServerViewIds } : {}),
    ...(tagIds.length > 0 ? { tagIds } : {}),
    ...(spaceIds.length > 0 ? { spaceIds } : {}),
    ...(activeUsersCount ? { activeUsersCount } : {}),
  };
}

export const AGENT_SEARCH_TABS = [
  {
    id: "all",
    label: "Workspace",
    filters: { status: ["active"], scope: ["visible", "hidden"] },
  },
  {
    id: "default",
    label: "Dust",
    filters: { status: ["active"], scope: ["global"] },
  },
  { id: "archived", label: "Archived", filters: { status: ["archived"] } },
] satisfies { id: string; label: string; filters: AgentSearchFilters }[];

export const AGENT_SEARCH_TAB_IDS = AGENT_SEARCH_TABS.map(({ id }) => id);
