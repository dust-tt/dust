import type { MemberUsageType } from "@app/lib/api/credits/members_usage";

// Plain data builder (no DB writes) for `MemberUsageType`, the shape
// `getMembersUsage`/`getMemberUsage` return. Used to stub `getMembersUsage`
// in route tests without repeating every field at each call site.
export function makeMemberUsage(
  overrides: Partial<MemberUsageType> = {}
): MemberUsageType {
  return {
    billingFrequency: "ANNUAL",
    consumedAwuCredits: 100,
    consumedFromAllowanceAwuCredits: 50,
    consumedFromPoolAwuCredits: 50,
    creditState: "on_pool",
    email: "member1@example.com",
    freeCreditEmptyAlert: null,
    freeCreditLowAlert: null,
    groups: [],
    image: null,
    memberUsageLimit: null,
    name: "Member One",
    rateLimiterState: null,
    isSpendCapped: false,
    nextCreditResetAt: null,
    sId: "member1",
    scheduledSeatChangeAt: null,
    scheduledSeatType: null,
    seatType: "max",
    seatBalanceAwu: 100,
    seatUsageTarget: null,
    overallUsageTarget: null,
    spendLimitAlertId: null,
    spendLimitAwuCredits: null,
    rateLimiterSpendAwuCredits: null,
    metronomeConsumedAwuCredits: null,
    spendLimitSource: "default",
    spendLimitGroupName: null,
    spendLimitWarningAlertId: null,
    ...overrides,
  };
}
