import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";

export const SEARCH_RESOURCE_TYPES = ["skill", "agent"] as const;
export type SearchResourceType = (typeof SEARCH_RESOURCE_TYPES)[number];
export type SearchPermissionFiltering = "strict" | "redact_unreadable";

export const SEARCH_MODES = [
  "autocomplete",
  "management",
  "discovery",
] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

// Within a dimension values are ORed; different dimensions are ANDed.
// These are selection filters, separate from the all-of space authorization predicate.
export interface SearchFilters {
  spaceIds?: string[];
  toolIds?: string[];
  editedByMe?: boolean;
  availability?: SkillAvailability[];
  isDefault?: boolean;
  tagIds?: string[];
  skillIds?: string[];
}

export interface ResourceSearchOptions {
  searchTerm: string;
  resourceTypes?: SearchResourceType[];
  mode?: SearchMode;
  filters?: SearchFilters;
  permissionFiltering?: SearchPermissionFiltering;
  limit?: number;
  cursor?: string;
}
