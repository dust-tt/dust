import type { SharedUsageLimitWithUsage } from "@app/types/api/groups/shared_usage_limit";

export function makeSharedUsageLimitUsage(
  overrides: Partial<SharedUsageLimitWithUsage> = {}
): SharedUsageLimitWithUsage {
  return {
    groupId: "group_1",
    limitAwuCredits: 5_000,
    usedAwuCredits: 0,
    usageTarget: "on_target",
    ...overrides,
  };
}
