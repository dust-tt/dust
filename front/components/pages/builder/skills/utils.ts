import { SKILL_AVAILABILITY_DISPLAY } from "@app/components/skills/skillAvailabilityDisplay";
import { compareStrings } from "@app/lib/i18n/format";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type {
  SkillAvailability,
  SkillWithoutInstructionsAndToolsWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type SkillManagerTabType =
  | "active"
  | "editable_by_me"
  | "favorites"
  | "archived";

interface SkillManagerTab {
  id: SkillManagerTabType;
  label: MessageDescriptor;
  description: MessageDescriptor;
}

export const SKILL_MANAGER_TABS: SkillManagerTab[] = [
  {
    id: "active",
    label: msg({ message: "All", context: "tab listing all skills" }),
    description: msg`All active skills`,
  },
  {
    id: "editable_by_me",
    label: msg`Editable by me`,
    description: msg`Skills you can edit`,
  },
  {
    id: "favorites",
    label: msg`Favorites`,
    description: msg`Skills you favorited`,
  },
  { id: "archived", label: msg`Archived`, description: msg`Archived skills` },
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

const ALL_AVAILABILITIES_LABEL = msg`All availabilities`;

export function getAvailabilityFilterOptions(
  t: (descriptor: MessageDescriptor) => string
): {
  value: AvailabilityFilter;
  label: string;
}[] {
  return [
    { value: "all", label: t(ALL_AVAILABILITIES_LABEL) },
    ...SKILL_AVAILABILITIES.map((availability) => ({
      value: availability,
      label: t(SKILL_AVAILABILITY_DISPLAY[availability].label),
    })),
  ];
}

export function getAvailabilityFilterLabel(
  filter: AvailabilityFilter,
  t: (descriptor: MessageDescriptor) => string
): string {
  return (
    getAvailabilityFilterOptions(t).find((o) => o.value === filter)?.label ??
    t(ALL_AVAILABILITIES_LABEL)
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
  return skills.toSorted((a, b) => compareStrings(a.name, b.name));
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
