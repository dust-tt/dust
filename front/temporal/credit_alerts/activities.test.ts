import { MembershipResource } from "@app/lib/resources/membership_resource";
import {
  expireWorkspacePoolCapOverridesActivity,
  getWorkspacesWithExpiredPoolCapOverrideActivity,
} from "@app/temporal/credit_alerts/activities";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("getWorkspacesWithExpiredPoolCapOverrideActivity", () => {
  it("returns only workspaces with an expired override, not ones with an active one", async () => {
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

    const workspaceIds =
      await getWorkspacesWithExpiredPoolCapOverrideActivity();

    expect(workspaceIds).toContain(expiredWorkspace.sId);
    expect(workspaceIds).not.toContain(activeWorkspace.sId);
  });

  it("returns an empty list when nothing has expired", async () => {
    const workspaceIds =
      await getWorkspacesWithExpiredPoolCapOverrideActivity();

    expect(workspaceIds).toEqual([]);
  });
});

describe("expireWorkspacePoolCapOverridesActivity", () => {
  it("reverts an expired override in the given workspace and leaves other workspaces untouched", async () => {
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

    await expireWorkspacePoolCapOverridesActivity(expiredWorkspace.sId);

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
  });

  it("is a no-op when nothing has expired in the given workspace", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: "cust_noop_xxx",
    });

    await expect(
      expireWorkspacePoolCapOverridesActivity(workspace.sId)
    ).resolves.toBeUndefined();
  });
});
