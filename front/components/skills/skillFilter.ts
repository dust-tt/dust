import type { SearchFilter } from "@app/components/shared/filter_panel/searchFilter";
import {
  getSearchFilterIds,
  getSearchFilterMcpServerViewIds,
} from "@app/components/shared/filter_panel/searchFilter";
import type {
  SkillSearchFacet,
  SkillSearchFilters,
} from "@app/types/api/skills";

export const SKILL_FILTER_CATEGORIES = [
  "availability",
  "tool",
  "editor",
  "space",
] as const;

export type SkillFilterCategory = (typeof SKILL_FILTER_CATEGORIES)[number];

export type SkillFilter = SearchFilter<SkillFilterCategory>;

export const SKILL_FILTER_CATEGORY_FACET: Record<
  SkillFilterCategory,
  SkillSearchFacet
> = {
  availability: "availability",
  tool: "mcpServerViews",
  editor: "editors",
  space: "spaces",
};

export function toSkillSearchFilters(filter: SkillFilter): SkillSearchFilters {
  const availability = (filter.availability ?? []).flatMap((option) =>
    option.category === "availability" ? [option.id] : []
  );
  const mcpServerViewIds = getSearchFilterMcpServerViewIds(filter);
  const editorIds = getSearchFilterIds(filter, "editor");
  const spaceIds = getSearchFilterIds(filter, "space");

  return {
    ...(availability.length > 0 ? { availability } : {}),
    ...(mcpServerViewIds.length > 0 ? { mcpServerViewIds } : {}),
    ...(editorIds.length > 0 ? { editorIds } : {}),
    ...(spaceIds.length > 0 ? { spaceIds } : {}),
  };
}
