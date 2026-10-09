import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";

export const MIN_SHARED_USAGE_LIMIT_AWU_CREDITS = 0;
export const MAX_SHARED_USAGE_LIMIT_AWU_CREDITS = 100_000_000;

export type SharedUsageLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type SetSharedUsageLimitResponse = {
  limit: SharedUsageLimit;
};

export type PutSharedUsageLimitResponseBody = SetSharedUsageLimitResponse;

export type SharedUsageLimitWithUsage = {
  groupId: string;
  limitAwuCredits: number;
  usedAwuCredits: number;
  usageTarget?: CreditUsageTarget | null;
};

export type VisibleMemberSharedUsageLimitGroup = {
  kind: "visible";
  groupId: string;
  name: string;
};

export type MemberSharedUsageLimitGroup =
  | VisibleMemberSharedUsageLimitGroup
  | { kind: "hidden" };

export type GetGroupsUsageResponseBody = {
  groups: SharedUsageLimitWithUsage[];
};

export type SharedUsageLimitOverlap = {
  groupId: string;
  name: string;
  position: number;
  limitAwuCredits: number;
  poolCapAwuCredits: number | null;
  sharedMemberCount: number | null;
};

export type GetSharedUsageLimitOverlapsResponseBody = {
  groups: SharedUsageLimitOverlap[];
};

export type PutSharedUsageLimitPrioritiesResponseBody = {
  orderedGroupIds: string[];
};
