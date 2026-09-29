import type {
  SearchFilter,
  SearchFilterFacets,
} from "@app/components/shared/filter_panel/searchFilter";
import {
  getSearchFilterActiveUsersCount,
  getSearchFilterIds,
  getSearchFilterMcpServerViewIds,
} from "@app/components/shared/filter_panel/searchFilter";
import type {
  SearchSkillsResponseBody,
  SkillSearchFacet,
  SkillSearchFilters,
} from "@app/types/api/skills";

export const SKILL_FILTER_CATEGORIES = [
  "availability",
  "tool",
  "skill",
  "editor",
  "space",
  "usage",
] as const;

export type SkillFilterCategory = (typeof SKILL_FILTER_CATEGORIES)[number];

export type SkillFilter = SearchFilter<SkillFilterCategory>;

export const SKILL_FILTER_CATEGORY_FACET: Record<
  SkillFilterCategory,
  SkillSearchFacet
> = {
  availability: "availability",
  tool: "mcpServerViews",
  skill: "childSkills",
  editor: "editors",
  space: "spaces",
  usage: "usage",
};

export function toSkillSearchFilters(filter: SkillFilter): SkillSearchFilters {
  const availability = (filter.availability ?? []).flatMap((option) =>
    option.category === "availability" ? [option.id] : []
  );
  const mcpServerViewIds = getSearchFilterMcpServerViewIds(filter);
  const childSkillIds = getSearchFilterIds(filter, "skill");
  const editorIds = getSearchFilterIds(filter, "editor");
  const spaceIds = getSearchFilterIds(filter, "space");
  const activeUsersCount = getSearchFilterActiveUsersCount(filter);

  return {
    ...(availability.length > 0 ? { availability } : {}),
    ...(mcpServerViewIds.length > 0 ? { mcpServerViewIds } : {}),
    ...(childSkillIds.length > 0 ? { childSkillIds } : {}),
    ...(editorIds.length > 0 ? { editorIds } : {}),
    ...(spaceIds.length > 0 ? { spaceIds } : {}),
    ...(activeUsersCount ? { activeUsersCount } : {}),
  };
}

// Skills filter on the skills they use as child skills.
export function toSkillSearchFilterFacets(
  facets: SearchSkillsResponseBody["facets"] | undefined
): SearchFilterFacets | undefined {
  return facets && { ...facets, skills: facets.childSkills };
}

export const SKILL_SEARCH_TABS = [
  { id: "all", label: "All", filters: { status: ["active"] } },
  {
    id: "default",
    label: "Default",
    filters: { status: ["active"], codeDefinedOnly: true },
  },
  { id: "archived", label: "Archived", filters: { status: ["archived"] } },
] satisfies { id: string; label: string; filters: SkillSearchFilters }[];

export const SKILL_SEARCH_TAB_IDS = SKILL_SEARCH_TABS.map(({ id }) => id);
