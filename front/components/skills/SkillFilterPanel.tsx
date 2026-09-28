import { getIcon } from "@app/components/resources/resources_icons";
import { FilterPanel } from "@app/components/shared/filter_panel/FilterPanel";
import { clearFilterCategory } from "@app/components/shared/filter_panel/filterState";
import { useFilterPanel } from "@app/components/shared/filter_panel/useFilterPanel";
import type {
  SkillFilter,
  SkillFilterCategory,
  SkillFilterOption,
} from "@app/components/skills/skillFilter";
import {
  SKILL_AVAILABILITY_FILTER_OPTIONS,
  SKILL_EDITOR_FILTER_OPTIONS,
  SKILL_FILTER_CATEGORIES,
  SKILL_FILTER_CATEGORY_LABEL,
  toSkillSearchFilters,
} from "@app/components/skills/skillFilter";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSearchSkills } from "@app/lib/swr/skill_configurations";
import type {
  SearchSkillsResponseBody,
  SkillSearchFacet,
  SkillSearchFilters,
} from "@app/types/api/skills";
import type { LightWorkspaceType } from "@app/types/user";
import { Icon } from "@dust-tt/sparkle";

// The skill search endpoint accepts at most 100 MCP server view IDs.
const MAX_MCP_SERVER_VIEW_IDS = 100;

interface SkillFilterPanelProps {
  owner: LightWorkspaceType;
  searchTerm: string;
  tabFilters: SkillSearchFilters;
  filter: SkillFilter;
  onFilterChange: (filter: SkillFilter) => void;
}

const SKILL_FILTER_CATEGORY_FACET: Record<
  SkillFilterCategory,
  SkillSearchFacet
> = {
  availability: "availability",
  tool: "mcpServerViews",
  editor: "editors",
};

// One option per MCP server, filtering on every view of it that matching skills use.
function toToolOptions(
  views: NonNullable<SearchSkillsResponseBody["facets"]["mcpServerViews"]>
): SkillFilterOption[] {
  const optionsByServerId = new Map<
    string,
    Extract<SkillFilterOption, { category: "tool" }>
  >();
  for (const view of views) {
    const option = optionsByServerId.get(view.mcpServerId);
    if (option) {
      option.mcpServerViewIds.push(view.sId);
    } else {
      optionsByServerId.set(view.mcpServerId, {
        category: "tool",
        id: view.mcpServerId,
        name: view.name,
        icon: view.icon,
        mcpServerViewIds: [view.sId],
        disabled: false,
      });
    }
  }
  return [...optionsByServerId.values()].toSorted((a, b) =>
    a.name.localeCompare(b.name)
  );
}

function renderOptionIcon(option: SkillFilterOption) {
  return option.category === "tool" ? (
    <Icon visual={getIcon(option.icon)} size="sm" />
  ) : null;
}

export function SkillFilterPanel({
  owner,
  searchTerm,
  tabFilters,
  filter,
  onFilterChange,
}: SkillFilterPanelProps) {
  const { user } = useAuth();
  const panel = useFilterPanel<SkillFilterCategory, SkillFilterOption>(
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

  const availabilities = new Set(
    (facets?.availability ?? []).map(({ availability }) => availability)
  );
  const categoryOptions: Record<SkillFilterCategory, SkillFilterOption[]> = {
    availability: SKILL_AVAILABILITY_FILTER_OPTIONS.filter(
      (option) =>
        option.category === "availability" && availabilities.has(option.id)
    ),
    tool: toToolOptions(facets?.mcpServerViews ?? []),
    editor: (facets?.editors ?? []).some((editor) => editor.sId === user.sId)
      ? SKILL_EDITOR_FILTER_OPTIONS
      : [],
  };
  const hasTooManyTools =
    (toSkillSearchFilters(draftFilter).mcpServerViewIds?.length ?? 0) >
    MAX_MCP_SERVER_VIEW_IDS;

  return (
    <FilterPanel
      panel={panel}
      categories={SKILL_FILTER_CATEGORIES}
      categoryLabels={SKILL_FILTER_CATEGORY_LABEL}
      filter={filter}
      onFilterChange={onFilterChange}
      activeCategoryOptions={categoryOptions[activeCategory]}
      status={isSkillsLoading ? "loading" : "idle"}
      isError={isSkillsError}
      idPrefix="skill-filter"
      renderIcon={renderOptionIcon}
      warning={hasTooManyTools ? "Too many tools selected." : undefined}
      applyDisabled={hasTooManyTools}
    />
  );
}
