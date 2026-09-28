import { clearFilterCategory } from "@app/components/shared/filter_panel/filterState";
import { SearchFilterPanel } from "@app/components/shared/filter_panel/SearchFilterPanel";
import type { SearchFilterOption } from "@app/components/shared/filter_panel/searchFilter";
import { useFilterPanel } from "@app/components/shared/filter_panel/useFilterPanel";
import type {
  SkillFilter,
  SkillFilterCategory,
} from "@app/components/skills/skillFilter";
import {
  SKILL_FILTER_CATEGORIES,
  SKILL_FILTER_CATEGORY_FACET,
  toSkillSearchFilters,
} from "@app/components/skills/skillFilter";
import { useSearchSkills } from "@app/lib/swr/skill_configurations";
import type { SkillSearchFilters } from "@app/types/api/skills";
import type { LightWorkspaceType } from "@app/types/user";

// The skill search endpoint accepts at most 100 MCP server view IDs.
const MAX_MCP_SERVER_VIEW_IDS = 100;

interface SkillFilterPanelProps {
  owner: LightWorkspaceType;
  searchTerm: string;
  tabFilters: SkillSearchFilters;
  filter: SkillFilter;
  onFilterChange: (filter: SkillFilter) => void;
}

export function SkillFilterPanel({
  owner,
  searchTerm,
  tabFilters,
  filter,
  onFilterChange,
}: SkillFilterPanelProps) {
  const panel = useFilterPanel<SkillFilterCategory, SearchFilterOption>(
    filter,
    SKILL_FILTER_CATEGORIES
  );
  const { isOpen, activeCategory, draftFilter } = panel;
  // Options are the values held by the skills matching the search, the tab and the draft
  // selections of the other categories: the active category ignores its own selection so that its
  // options stay selectable together.
  const { facets, isSkillsLoading, isSkillsError } = useSearchSkills({
    owner,
    searchTerm,
    limit: 0,
    filters: {
      ...tabFilters,
      ...toSkillSearchFilters(clearFilterCategory(draftFilter, activeCategory)),
    },
    facets: [SKILL_FILTER_CATEGORY_FACET[activeCategory]],
    disabled: !isOpen,
  });
  const hasTooManyTools =
    (toSkillSearchFilters(draftFilter).mcpServerViewIds?.length ?? 0) >
    MAX_MCP_SERVER_VIEW_IDS;

  return (
    <SearchFilterPanel
      panel={panel}
      categories={SKILL_FILTER_CATEGORIES}
      filter={filter}
      onFilterChange={onFilterChange}
      facets={facets && { ...facets, skills: facets.childSkills }}
      isLoading={isSkillsLoading}
      isError={isSkillsError}
      idPrefix="skill-filter"
      warning={hasTooManyTools ? "Too many tools selected." : undefined}
      applyDisabled={hasTooManyTools}
    />
  );
}
