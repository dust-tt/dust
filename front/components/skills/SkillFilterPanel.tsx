import { clearFilterCategory } from "@app/components/shared/filter_panel/filterState";
import type { SearchFilterOption } from "@app/components/shared/filter_panel/searchFilter";
import { SearchFilterPanel } from "@app/components/shared/filter_panel/SearchFilterPanel";
import { useFilterPanel } from "@app/components/shared/filter_panel/useFilterPanel";
import type {
  SkillFilter,
  SkillFilterCategory,
} from "@app/components/skills/skillFilter";
import {
  SKILL_FILTER_CATEGORIES,
  SKILL_FILTER_CATEGORY_FACET,
  toSkillSearchFilterFacets,
  toSkillSearchFilters,
} from "@app/components/skills/skillFilter";
import { useSearchSkills } from "@app/lib/swr/skill_configurations";
import type {
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
} from "@app/types/api/skills";
import type { LightWorkspaceType } from "@app/types/user";
import { Checkbox, InfoCircle, Label, Tooltip } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

// The skill search endpoint accepts at most 100 MCP server view IDs.
const MAX_MCP_SERVER_VIEW_IDS = 100;

interface SkillFilterPanelProps {
  owner: LightWorkspaceType;
  searchEndpoint?: string;
  searchTerm: string;
  tabFilters: SkillSearchFilters;
  permissionFiltering?: SkillSearchPermissionFiltering;
  filter: SkillFilter;
  onFilterChange: (filter: SkillFilter) => void;
  hiddenSkills?: {
    isShown: boolean;
    onChange: (isShown: boolean) => void;
  };
}

/**
 * @cc [owner:aubin-tchoi,label:security;product] hidden-skills-draft
 * When hiddenSkills is offered, the checkbox changes facet visibility while the popover is open,
 * but changes the list only on Apply. Cancel discards the draft and Clear filters resets it.
 */
export function SkillFilterPanel({
  owner,
  searchEndpoint,
  searchTerm,
  tabFilters,
  permissionFiltering,
  filter,
  onFilterChange,
  hiddenSkills,
}: SkillFilterPanelProps) {
  const { t } = useLingui();
  const panel = useFilterPanel<SkillFilterCategory, SearchFilterOption>(
    filter,
    SKILL_FILTER_CATEGORIES
  );
  const { isOpen, activeCategory, draftFilter } = panel;
  const [draftShowHiddenSkills, setDraftShowHiddenSkills] = useState(
    hiddenSkills?.isShown ?? false
  );
  // Options are the values held by the skills matching the search, the tab and the draft
  // selections of the other categories: the active category ignores its own selection so that its
  // options stay selectable together.
  const { facets, isSkillsLoading, isSkillsError } = useSearchSkills({
    owner,
    searchEndpoint,
    searchTerm,
    searchType: "name",
    limit: 0,
    filters: {
      ...tabFilters,
      ...toSkillSearchFilters(clearFilterCategory(draftFilter, activeCategory)),
    },
    permissionFiltering: hiddenSkills
      ? draftShowHiddenSkills
        ? "redact_unreadable"
        : undefined
      : permissionFiltering,
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
      onFilterChange={(nextFilter) => {
        onFilterChange(nextFilter);
        hiddenSkills?.onChange(draftShowHiddenSkills);
      }}
      onOpen={() => setDraftShowHiddenSkills(hiddenSkills?.isShown ?? false)}
      onClearAll={() => setDraftShowHiddenSkills(false)}
      facets={toSkillSearchFilterFacets(facets)}
      isLoading={isSkillsLoading}
      isError={isSkillsError}
      idPrefix="skill-filter"
      warning={hasTooManyTools ? t`Too many tools selected.` : undefined}
      applyDisabled={hasTooManyTools}
      categoryNavFooter={
        hiddenSkills && (
          <div className="flex items-center gap-2 p-2">
            <Checkbox
              id="skill-filter-hidden-skills"
              checked={draftShowHiddenSkills}
              onCheckedChange={(checked) =>
                setDraftShowHiddenSkills(checked === true)
              }
            />
            <Label
              htmlFor="skill-filter-hidden-skills"
              className="cursor-pointer text-sm leading-none md:whitespace-nowrap"
            >
              <Trans>Hidden skills</Trans>
            </Label>
            <Tooltip
              label={t`Shows skills you can access as an admin, even if you’re not an editor`}
              trigger={<InfoCircle className="h-4 w-4 text-muted-foreground" />}
            />
          </div>
        )
      }
    />
  );
}
