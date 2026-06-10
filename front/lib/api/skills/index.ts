import type {
  SkillType,
  SkillWithoutInstructionsAndToolsType,
  SkillWithoutInstructionsAndToolsWithRelationsType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

export type GetSkillsResponseBody = {
  skills: SkillWithoutInstructionsAndToolsType[];
};

export type GetSkillsWithRelationsResponseBody = {
  skills: SkillWithoutInstructionsAndToolsWithRelationsType[];
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
  skill: SkillType;
};

export type GetSkillWithRelationsResponseBody = {
  skill: SkillWithRelationsType;
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
