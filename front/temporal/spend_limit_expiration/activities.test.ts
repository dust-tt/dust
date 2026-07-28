import { Authenticator } from "@app/lib/auth";
import * as spendLimits from "@app/lib/metronome/alerts/spend_limits";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import { expirePoolCapOverridesActivity } from "@app/temporal/spend_limit_expiration/activities";
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

beforeEach(() => {
  vi.mocked(spendLimits.clearMetronomePerUserCapAlert).mockResolvedValue(
    new Ok(undefined)
  );
  vi.mocked(spendLimits.clearMetronomePerUserWarningAlert).mockResolvedValue(
    new Ok(undefined)
  );
});

describe("expirePoolCapOverridesActivity", () => {
  it("reverts an expired override and leaves an unexpired one untouched, across workspaces", async () => {
    const expiredWorkspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: "cust_expired_xxx",
    });
    const expiredUser = await UserFactory.basic();
    const expiredMembership = await MembershipFactory.associate(
      expiredWorkspace,
      expiredUser,
      { role: "user" }
    );
    await expiredMembership.updatePoolCapOverride({
      poolCapOverrideAwuCredits: 500,
      poolCapOverrideExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const activeWorkspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: "cust_active_xxx",
    });
    const activeUser = await UserFactory.basic();
    const activeMembership = await MembershipFactory.associate(
      activeWorkspace,
      activeUser,
      { role: "user" }
    );
    await activeMembership.updatePoolCapOverride({
      poolCapOverrideAwuCredits: 900,
      poolCapOverrideExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expirePoolCapOverridesActivity();

    const revertedMembership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user: expiredUser,
        workspace: expiredWorkspace,
      });
    expect(revertedMembership?.poolCapOverrideAwuCredits).toBeNull();
    expect(revertedMembership?.poolCapOverrideExpiresAt).toBeNull();

    const untouchedMembership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user: activeUser,
        workspace: activeWorkspace,
      });
    expect(untouchedMembership?.poolCapOverrideAwuCredits).toBe(900);
    expect(untouchedMembership?.poolCapOverrideExpiresAt).not.toBeNull();

    expect(spendLimits.clearMetronomePerUserCapAlert).toHaveBeenCalledTimes(1);
    expect(spendLimits.clearMetronomePerUserCapAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: expiredWorkspace.sId,
        userId: expiredUser.sId,
      })
    );
  });

  it("is a no-op when nothing has expired", async () => {
    await expirePoolCapOverridesActivity();

    expect(spendLimits.clearMetronomePerUserCapAlert).not.toHaveBeenCalled();
  });

  it("stamps expiredAt on the upgrade request that granted the reverted override", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: "cust_linked_xxx",
    });
    const user = await UserFactory.basic();
    const membership = await MembershipFactory.associate(workspace, user, {
      role: "user",
    });
    await membership.updatePoolCapOverride({
      poolCapOverrideAwuCredits: 1500,
      poolCapOverrideExpiresAt: new Date(Date.now() - 1000),
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const requestResult = await MembershipUpgradeRequestResource.createPending(
      auth,
      { user, reason: "backfill", requestedDurationDays: 1 }
    );
    if (requestResult.isErr()) {
      throw requestResult.error;
    }
    await requestResult.value.recordGrant({
      awuCredits: 1500,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expirePoolCapOverridesActivity();

    const afterSweep = await MembershipUpgradeRequestResource.fetchById(
      auth,
      requestResult.value.sId
    );
    expect(afterSweep?.grantedAwuCredits).toBe(1500);
    expect(afterSweep?.expiredAt).not.toBeNull();
  });
});
