import type { SkillPermissionFilteringMode } from "@app/lib/resources/skill/skill_resource";
import type {
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

export type SkillSearchResult = Pick<
  SkillWithoutInstructionsAndToolsType,
  | "editedBy"
  | "icon"
  | "name"
  | "requestedSpaceIds"
  | "sId"
  | "userFacingDescription"
> & {
  // Fixed relevance score shared with code-defined skills. Older clients may ignore it.
  score?: number;
  // False for an unreadable result retained by admin-only redact_unreadable search.
  canRead?: boolean;
};

export type SkillSearchPermissionFiltering = Exclude<
  SkillPermissionFilteringMode,
  "dangerously_skip"
>;

export const SEARCH_MODES = [
  "autocomplete",
  "management",
  "discovery",
] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

// OR within a dimension, AND across dimensions. Selection never replaces ACLs.
export interface SkillSearchFilters {
  spaceIds?: string[];
  toolIds?: string[];
  editedByMe?: boolean;
  availability?: SkillWithoutInstructionsAndToolsType["availability"][];
  isDefault?: boolean;
}

export interface SkillSearchOptions {
  searchTerm: string;
  mode?: SearchMode;
  filters?: SkillSearchFilters;
  permissionFiltering?: SkillSearchPermissionFiltering;
  limit?: number;
  cursor?: string;
}

export type SearchSkillsResponseBody = {
  skills: SkillSearchResult[];
  // Null means exhausted; optional for clients talking to an older server.
  nextCursor?: string | null;
};

export type GetSkillsWithRelationsResponseBody = {
  skills: (SkillWithoutInstructionsAndToolsWithRelationsType & {
    isFavorite?: boolean;
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
  skill: SkillType & { isFavorite?: boolean };
};

export type GetSkillWithRelationsResponseBody = {
  skill: SkillWithRelationsType & { isFavorite?: boolean };
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
