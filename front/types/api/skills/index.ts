import type { SkillPermissionFilteringMode } from "@app/lib/resources/skill/skill_resource";
import type {
  SkillAvailability,
  SkillListItemType,
  SkillType,
  SkillWithoutInstructionsAndToolsType,
  SkillWithoutInstructionsAndToolsWithRelationsType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

export type GetSkillsResponseBody = {
  skills: (SkillWithoutInstructionsAndToolsType & {
    isFavorite?: boolean;
  })[];
};

export type SkillSearchResult = SkillListItemType & {
  score: number;
  // Readability of the indexed requirements, not an authorization for full-skill access.
  canRead: boolean;
};

export type SkillSearchPermissionFiltering = Exclude<
  SkillPermissionFilteringMode,
  "dangerously_skip"
>;

// OR within a dimension, AND across dimensions. Selection never replaces ACLs.
export interface SkillSearchFilters {
  // Omitted means active only. Suggested skills are never searchable.
  status?: ("active" | "archived")[];
  spaceIds?: string[];
  toolIds?: string[];
  editedByMe?: boolean;
  availability?: SkillAvailability[];
  isDefault?: boolean;
}

export interface SkillSearchOptions {
  searchTerm: string;
  filters?: SkillSearchFilters;
  permissionFiltering?: SkillSearchPermissionFiltering;
}

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
