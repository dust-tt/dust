import { SKILL_AVAILABILITY_DISPLAY } from "@app/lib/skills/labels";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type {
  SkillAvailability,
  SkillWithoutInstructionsAndToolsWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration";

export type SkillManagerTabType =
  | "active"
  | "editable_by_me"
  | "favorites"
  | "archived";

interface SkillManagerTab {
  id: SkillManagerTabType;
  label: string;
  description: string;
}

export const SKILL_MANAGER_TABS: SkillManagerTab[] = [
  { id: "active", label: "All", description: "All active skills" },
  {
    id: "editable_by_me",
    label: "Editable by me",
    description: "Skills you can edit",
  },
  {
    id: "favorites",
    label: "Favorites",
    description: "Skills you favorited",
  },
  { id: "archived", label: "Archived", description: "Archived skills" },
];

export function isValidTab(tab: string): tab is SkillManagerTabType {
  return SKILL_MANAGER_TABS.some((t) => t.id === tab);
}

export type AvailabilityFilter = SkillAvailability | "all";

export function isAvailabilityFilter(
  value: string | undefined
): value is SkillAvailability {
  return SKILL_AVAILABILITIES.some((a) => a === value);
}

export const AVAILABILITY_QUERY_PARAMS = ["availability"];

export const AVAILABILITY_FILTER_OPTIONS: {
  value: AvailabilityFilter;
  label: string;
}[] = [
  { value: "all", label: "All availabilities" },
  ...SKILL_AVAILABILITIES.map((availability) => ({
    value: availability,
    label: SKILL_AVAILABILITY_DISPLAY[availability].label,
  })),
];

export function getAvailabilityFilterLabel(filter: AvailabilityFilter): string {
  return (
    AVAILABILITY_FILTER_OPTIONS.find((o) => o.value === filter)?.label ??
    "All availabilities"
  );
}

function getSkillSearchString(
  skill: SkillWithoutInstructionsAndToolsWithRelationsType
): string {
  const skillEditorNames =
    skill.relations.editors?.map((e) => e.fullName) ?? [];
  return [skill.name].concat(skillEditorNames).join(" ").toLowerCase();
}

export function sortSkillsByName(
  skills: SkillWithoutInstructionsAndToolsWithRelationsType[]
) {
  return skills.toSorted((a, b) => a.name.localeCompare(b.name));
}

export function filterByAvailability(
  skills: SkillWithoutInstructionsAndToolsWithRelationsType[],
  availabilityFilter: AvailabilityFilter
) {
  return availabilityFilter === "all"
    ? skills
    : skills.filter((s) => s.availability === availabilityFilter);
}

export function filterBySearch(
  skills: SkillWithoutInstructionsAndToolsWithRelationsType[],
  searchLower: string,
  isSearchActive: boolean
) {
  if (!isSearchActive) {
    return skills;
  }
  return skills
    .filter((s) => subFilter(searchLower, getSkillSearchString(s)))
    .sort((a, b) =>
      compareForFuzzySort(
        searchLower,
        getSkillSearchString(a),
        getSkillSearchString(b)
      )
    );
}
