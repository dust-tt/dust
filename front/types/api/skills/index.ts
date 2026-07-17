import type {
  SkillType,
  SkillWithoutInstructionsAndToolsType,
  SkillWithoutInstructionsAndToolsWithRelationsType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

// User-specific state appended only at the private skill API response boundary.
export type SkillUserFavoriteState =
  | { isFavorite: boolean }
  | { isFavorite?: never };

export type SkillResponseType = SkillType & SkillUserFavoriteState;

export type SkillWithRelationsResponseType = SkillWithRelationsType &
  SkillUserFavoriteState;

export type SkillListItemResponseType = SkillWithoutInstructionsAndToolsType &
  SkillUserFavoriteState;

export type SkillListItemWithRelationsResponseType =
  SkillWithoutInstructionsAndToolsWithRelationsType & SkillUserFavoriteState;

export type GetSkillsResponseBody = {
  skills: SkillListItemResponseType[];
};

export type GetSkillsWithRelationsResponseBody = {
  skills: SkillListItemWithRelationsResponseType[];
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
  skill: SkillResponseType;
};

export type GetSkillWithRelationsResponseBody = {
  skill: SkillWithRelationsResponseType;
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
