import type { SkillPermissionFilteringMode } from "@app/lib/resources/skill/skill_resource";
import type {
  SkillAvailability,
  SkillListItemType,
  SkillStatus,
  SkillType,
  SkillWithoutInstructionsAndToolsType,
  SkillWithoutInstructionsAndToolsWithRelationsType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { AgentsAndSkillsUsageType } from "@app/types/data_source";
import type { SpaceKind } from "@app/types/space";
import type { UserType } from "@app/types/user";

export type GetSkillsResponseBody = {
  skills: (SkillWithoutInstructionsAndToolsType & {
    isFavorite?: boolean;
  })[];
};

export type SkillSearchPermissionFiltering = Exclude<
  SkillPermissionFilteringMode,
  "dangerously_skip"
>;

// OR within a dimension, AND across dimensions. Selection never replaces ACLs.
export interface SkillSearchFilters {
  // Omitted means active only. Suggested skills are never searchable.
  status?: Extract<SkillStatus, "active" | "archived">[];
  mcpServerViewIds?: string[];
  // Supports "edited by me", but not "not edited by me".
  editedByMe?: true;
  availability?: SkillAvailability[];
  codeDefinedOnly?: true;
  editorIds?: string[];
  childSkillIds?: string[];
  spaceIds?: string[];
  // Inclusive bounds; skills without usage never match.
  activeUsersCount?: { min?: number; max?: number };
}

export const SKILL_SEARCH_TERMS_FACETS = [
  "availability",
  "editors",
  "childSkills",
  "spaces",
] as const;
export type SkillSearchTermsFacet = (typeof SKILL_SEARCH_TERMS_FACETS)[number];

export const SKILL_SEARCH_FACETS = [
  ...SKILL_SEARCH_TERMS_FACETS,
  "usage",
] as const;
export type SkillSearchFacet = (typeof SKILL_SEARCH_FACETS)[number];

export interface SkillSearchFacetValue {
  value: string;
  count: number;
}

// Bounds of a numeric facet; null when no matching skill holds a value.
export interface SkillSearchRangeFacetValue {
  min: number | null;
  max: number | null;
}

// Distinct indexed values of each requested facet, with the number of matching skills holding each.
export type SkillSearchFacetValues = Partial<
  Record<SkillSearchTermsFacet, SkillSearchFacetValue[]>
> & { usage?: SkillSearchRangeFacetValue };

export const SKILL_SEARCH_SORTS = [
  "relevance",
  "usage",
  "name",
  "updatedAt",
] as const;
export type SkillSearchSort = (typeof SKILL_SEARCH_SORTS)[number];

export const SKILL_SEARCH_SORT_ORDERS = ["asc", "desc"] as const;
export type SkillSearchSortOrder = (typeof SKILL_SEARCH_SORT_ORDERS)[number];

export type PostSkillsUsedByResponseBody = {
  usedBy: Record<string, AgentsAndSkillsUsageType>;
};

export type SearchSkillsResponseBody = {
  skills: SkillListItemType[];
  total: number;
  hasMore: boolean;
  facets: {
    availability?: { availability: SkillAvailability; count: number }[];
    editors?: (Pick<UserType, "sId" | "fullName" | "image"> & {
      count: number;
    })[];
    childSkills?: {
      sId: string;
      name: string;
      icon: string | null;
      count: number;
    }[];
    spaces?: { sId: string; name: string; kind: SpaceKind; count: number }[];
    usage?: SkillSearchRangeFacetValue;
  };
};

/**
 * @cc [owner:aubin-tchoi,label:api] skill-usage-compatibility
 * `usage` is included only for `withUsage=true` and is null when unavailable.
 * Each skill always includes `messageCount: null` for legacy clients.
 */
export type GetSkillsWithRelationsResponseBody = {
  skills: (SkillWithoutInstructionsAndToolsWithRelationsType & {
    isFavorite?: boolean;
    // Attributed skill_management.enable_skill calls over the last 30 days.
    // Null for system skills or when analytics is unavailable.
    usage?: number | null;
    /** @deprecated Use usage instead. Always null when returned. */
    messageCount?: number | null;
  })[];
};

export type PostSkillResponseBody = {
  skill: SkillType;
};

export type GetReinforcementDailySpendResponseBody = {
  // ISO date strings ("YYYY-MM-DD") → spend in microUSD for that day.
  dailySpendMicroUsd: Record<string, number>;
  // ISO date strings ("YYYY-MM-DD") → spend in AWU credits for that day
  // (margin included, as billed to Metronome).
  dailySpendAwuCredits: Record<string, number>;
  periodStartDate: string;
  periodEndDate: string;
};

export type GetSkillResponseBody = {
  skill: SkillType & { isFavorite: boolean };
};

export type GetSkillWithRelationsResponseBody = {
  skill: SkillWithRelationsType & { isFavorite: boolean };
};

export type PatchSkillResponseBody = {
  skill: Omit<
    SkillType,
    | "author"
    | "requestedSpaceIds"
    | "workspaceId"
    | "createdAt"
    | "updatedAt"
    | "editedBy"
  >;
};

export type DeleteSkillResponseBody = {
  success: boolean;
};

export type GetSkillsSpendResponseBody = {
  // Map from skill sId to total spent in the current billing period (microUSD).
  // Skills with no usage in the period are omitted.
  spentMicroUsdBySkillId: Record<string, number>;
  // Map from skill sId to total spent in the current billing period in AWU
  // credits (margin included, as billed to Metronome). Skills with no usage
  // in the period are omitted.
  spentAwuCreditsBySkillId: Record<string, number>;
};
