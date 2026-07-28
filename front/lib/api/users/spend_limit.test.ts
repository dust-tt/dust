import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { expireUserSpendLimitOverride } from "@app/lib/api/users/spend_limit";
import { Authenticator } from "@app/lib/auth";
import * as spendLimits from "@app/lib/metronome/alerts/spend_limits";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<typeof spendLimits>(
    "@app/lib/metronome/alerts/spend_limits"
  );
  return {
    ...actual,
    clearMetronomePerUserCapAlert: vi.fn(),
    clearMetronomePerUserWarningAlert: vi.fn(),
  };
});

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return { ...actual, emitAuditLogEventDirect: vi.fn() };
});

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";

beforeEach(() => {
  vi.mocked(spendLimits.clearMetronomePerUserCapAlert).mockResolvedValue(
    new Ok(undefined)
  );
  vi.mocked(spendLimits.clearMetronomePerUserWarningAlert).mockResolvedValue(
    new Ok(undefined)
  );
  vi.mocked(workosAudit.emitAuditLogEventDirect).mockResolvedValue(undefined);
});

describe("expireUserSpendLimitOverride", () => {
  it("reverts an active override, clears the alert, and emits a system-actored audit event", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
    });
    const user = await UserFactory.basic();
    const membership = await MembershipFactory.associate(workspace, user, {
      role: "user",
    });
    await membership.updatePoolCapOverride({
      poolCapOverrideAwuCredits: 2000,
      overrideLimitTimeframe: "week",
      poolCapOverrideExpiresAt: new Date(Date.now() - 1000),
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const result = await expireUserSpendLimitOverride(auth, {
      userId: user.sId,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        reverted: true,
        previousAwuCredits: 2000,
        previousTimeframe: "week",
      });
    }

    expect(spendLimits.clearMetronomePerUserCapAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
        workspaceId: workspace.sId,
        userId: user.sId,
      })
    );
    expect(workosAudit.emitAuditLogEventDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "membership.pool_cap_override_expired",
        actor: expect.objectContaining({ type: "system" }),
        metadata: {
          previous_awu_credits: "2000",
          previous_timeframe: "week",
        },
      })
    );

    const updatedMembership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
      });
    expect(updatedMembership?.poolCapOverrideAwuCredits).toBeNull();
    expect(updatedMembership?.overrideLimitTimeframe).toBeNull();
    expect(updatedMembership?.poolCapOverrideExpiresAt).toBeNull();
  });

  it("no-ops without touching Metronome or emitting audit when there is no override", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
    });
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const result = await expireUserSpendLimitOverride(auth, {
      userId: user.sId,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        reverted: false,
        previousAwuCredits: null,
        previousTimeframe: null,
      });
    }
    expect(spendLimits.clearMetronomePerUserCapAlert).not.toHaveBeenCalled();
    expect(workosAudit.emitAuditLogEventDirect).not.toHaveBeenCalled();
  });

  it("returns an error when the workspace is not on Metronome billing", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const result = await expireUserSpendLimitOverride(auth, {
      userId: user.sId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("workspace_not_metronome_billed");
    }
  });
});
