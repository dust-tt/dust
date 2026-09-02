import * as membersUsage from "@app/lib/api/credits/members_usage";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/credits/members_usage", async () => {
  const actual = await vi.importActual<typeof membersUsage>(
    "@app/lib/api/credits/members_usage"
  );
  return { ...actual, getMembersUsage: vi.fn() };
});

function membersUsageUrl(wId: string) {
  return `/api/w/${wId}/credits/members-usage`;
}

const MEMBER_USAGE = {
  billingFrequency: "ANNUAL" as const,
  consumedAwuCredits: 100,
  consumedFromAllowanceAwuCredits: 50,
  consumedFromPoolAwuCredits: 50,
  creditState: "normal" as const,
  email: "member1@example.com",
  freeCreditEmptyAlert: null,
  freeCreditLowAlert: null,
  groups: [],
  image: null,
  memberUsageLimit: null,
  name: "Member One",
  nearLimit: false,
  nextCreditResetAt: null,
  sId: "member1",
  scheduledSeatChangeAt: null,
  scheduledSeatType: null,
  seatType: "max" as const,
  seatBalanceAwu: 100,
  seatUsageTarget: null,
  spendLimitAlertId: null,
  spendLimitAwuCredits: null,
  rateLimiterSpendAwuCredits: null,
  metronomeConsumedAwuCredits: null,
  spendLimitSource: "default" as const,
  spendLimitGroupName: null,
  spendLimitWarningAlertId: null,
};

const CREDITS_RESET_AT = "2026-08-01T00:00:00.000Z";

beforeEach(() => {
  vi.mocked(membersUsage.getMembersUsage).mockResolvedValue({
    members: [MEMBER_USAGE],
    total: 1,
    creditsResetAt: CREDITS_RESET_AT,
  });
});

describe("GET /api/w/[wId]/credits/members-usage", () => {
  it("returns 403 when the caller is not a manager", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(membersUsageUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
    expect(membersUsage.getMembersUsage).not.toHaveBeenCalled();
  });

  it("allows a manager to read members usage", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "manager",
    });

    const response = await honoApp.request(membersUsageUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [MEMBER_USAGE],
      total: 1,
      creditsResetAt: CREDITS_RESET_AT,
    });
    expect(membersUsage.getMembersUsage).toHaveBeenCalled();
  });

  it("allows an admin to read members usage", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await honoApp.request(membersUsageUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [MEMBER_USAGE],
      total: 1,
      creditsResetAt: CREDITS_RESET_AT,
    });
  });
});
