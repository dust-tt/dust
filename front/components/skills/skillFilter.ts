import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/shared/filter_panel/filterState";
import type { MCPServerType } from "@app/lib/api/mcp";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/lib/skills/labels";
import type { SkillSearchFilters } from "@app/types/api/skills";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";

export const SKILL_FILTER_CATEGORIES = [
  "availability",
  "tool",
  "editor",
] as const;

export type SkillFilterCategory = (typeof SKILL_FILTER_CATEGORIES)[number];

export const SKILL_FILTER_CATEGORY_LABEL: Record<SkillFilterCategory, string> =
  {
    availability: "Availability",
    tool: "Tools",
    editor: "Editors",
  };

export const SKILL_FILTER_CATEGORY_SINGULAR_LABEL: Record<
  SkillFilterCategory,
  string
> = {
  availability: "Availability",
  tool: "Tool",
  editor: "Editor",
};

export type SkillFilterOption = FilterOptionBase &
  (
    | { category: "availability"; id: SkillAvailability }
    | {
        category: "tool";
        icon: MCPServerType["icon"];
        mcpServerViewIds: string[];
      }
    | { category: "editor"; id: "me" }
  );

export type SkillFilter = CategoryFilter<
  SkillFilterCategory,
  SkillFilterOption
>;

export const SKILL_AVAILABILITY_FILTER_OPTIONS: SkillFilterOption[] =
  SKILL_AVAILABILITIES.map((availability) => ({
    category: "availability",
    id: availability,
    name: SKILL_AVAILABILITY_DISPLAY[availability].label,
    disabled: false,
  }));

export const SKILL_EDITOR_FILTER_OPTIONS: SkillFilterOption[] = [
  { category: "editor", id: "me", name: "Me", disabled: false },
];

export function toSkillSearchFilters(filter: SkillFilter): SkillSearchFilters {
  const options = Object.values(filter).flat();
  const availability = options
    .filter((option) => option?.category === "availability")
    .map((option) => option.id);
  const mcpServerViewIds = options
    .filter((option) => option?.category === "tool")
    .flatMap((option) => option.mcpServerViewIds);

  return {
    ...(availability.length > 0 ? { availability } : {}),
    ...(mcpServerViewIds.length > 0 ? { mcpServerViewIds } : {}),
    ...(filter.editor?.length ? { editedByMe: true } : {}),
  };
}
