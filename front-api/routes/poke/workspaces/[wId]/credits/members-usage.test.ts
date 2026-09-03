import * as membersUsage from "@app/lib/api/credits/members_usage";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { makeMemberUsage } from "@app/tests/utils/MemberUsageFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/credits/members_usage", async () => {
  const actual = await vi.importActual<typeof membersUsage>(
    "@app/lib/api/credits/members_usage"
  );
  return { ...actual, getMembersUsage: vi.fn() };
});

function membersUsageUrl(wId: string) {
  return `/api/poke/workspaces/${wId}/credits/members-usage`;
}

const MEMBER_USAGE = makeMemberUsage({ overallUsageTarget: "critical" });

const CREDITS_RESET_AT = "2026-08-01T00:00:00.000Z";

beforeEach(() => {
  vi.mocked(membersUsage.getMembersUsage).mockResolvedValue({
    members: [MEMBER_USAGE],
    total: 1,
    creditsResetAt: CREDITS_RESET_AT,
  });
});

describe("GET /api/poke/workspaces/[wId]/credits/members-usage", () => {
  it("returns members usage including the off-pace target, with alert links requested", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await honoApp.request(membersUsageUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [MEMBER_USAGE],
      total: 1,
      creditsResetAt: CREDITS_RESET_AT,
    });
    expect(membersUsage.getMembersUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        includeAlertLinks: true,
        includeSeatBalance: true,
      })
    );
  });
});
