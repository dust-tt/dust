import * as workosAudit from "@app/lib/api/audit/workos_audit";
import * as reconcileCreditState from "@app/lib/api/metronome/reconcile_credit_state";
import { setUserSpendLimit } from "@app/lib/api/users/spend_limit";
import { Authenticator } from "@app/lib/auth";
import * as perUserAlerts from "@app/lib/metronome/alerts/spend_limits";
import * as seatTypes from "@app/lib/metronome/seat_types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<typeof perUserAlerts>(
    "@app/lib/metronome/alerts/spend_limits"
  );
  return {
    ...actual,
    upsertMetronomePerUserCapAlert: vi.fn(),
    upsertMetronomePerUserWarningAlert: vi.fn(),
    clearMetronomePerUserCapAlert: vi.fn(),
    clearMetronomePerUserWarningAlert: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<typeof seatTypes>(
    "@app/lib/metronome/seat_types"
  );
  return {
    ...actual,
    getSeatAllowancesByNormalizedSeatType: vi.fn(),
  };
});

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return {
    ...actual,
    emitAuditLogEvent: vi.fn(),
  };
});

vi.mock("@app/lib/api/metronome/reconcile_credit_state", async () => {
  const actual = await vi.importActual<typeof reconcileCreditState>(
    "@app/lib/api/metronome/reconcile_credit_state"
  );
  return {
    ...actual,
    reconcileUser: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const AUDIT_CONTEXT = { location: "127.0.0.1" };

beforeEach(() => {
  vi.mocked(perUserAlerts.upsertMetronomePerUserCapAlert).mockResolvedValue(
    new Ok({ alertId: "alert_user_cap_xxx" })
  );
  vi.mocked(perUserAlerts.upsertMetronomePerUserWarningAlert).mockResolvedValue(
    new Ok({ alertId: "alert_user_warning_xxx" })
  );
  vi.mocked(perUserAlerts.clearMetronomePerUserCapAlert).mockResolvedValue(
    new Ok(undefined)
  );
  vi.mocked(perUserAlerts.clearMetronomePerUserWarningAlert).mockResolvedValue(
    new Ok(undefined)
  );
  vi.mocked(seatTypes.getSeatAllowancesByNormalizedSeatType).mockResolvedValue(
    {}
  );
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
  vi.mocked(reconcileCreditState.reconcileUser).mockResolvedValue(
    new Ok({} as never)
  );
});

async function setupWorkspaceWithAdminAndMember() {
  const workspace = await WorkspaceFactory.metronome({
    metronomeCustomerId: METRONOME_CUSTOMER_ID,
  });
  const adminUser = await UserFactory.basic();
  const memberUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
  await MembershipFactory.associate(workspace, memberUser, { role: "user" });
  const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
    adminUser.sId,
    workspace.sId
  );
  return { workspace, adminAuth, memberUser };
}

describe("setUserSpendLimit requestId handling", () => {
  it("rejects a requestId that does not belong to the target user", async () => {
    const { adminAuth, memberUser } = await setupWorkspaceWithAdminAndMember();
    const otherUser = await UserFactory.basic();
    const workspace = adminAuth.getNonNullableWorkspace();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherRequest = unwrap(
      await MembershipUpgradeRequestResource.createPending(adminAuth, {
        user: otherUser,
        reason: null,
      })
    );

    const result = await setUserSpendLimit(adminAuth, {
      userId: memberUser.sId,
      limit: { kind: "limited", awuCredits: 5_000 },
      auditContext: AUDIT_CONTEXT,
      requestId: otherRequest.sId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("request_invalid");
    }
    expect(perUserAlerts.upsertMetronomePerUserCapAlert).not.toHaveBeenCalled();

    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user: memberUser,
        workspace,
      });
    expect(membership?.poolCapOverrideAwuCredits).toBeNull();
  });

  it("rejects a requestId for a request that is no longer pending", async () => {
    const { adminAuth, memberUser } = await setupWorkspaceWithAdminAndMember();
    const request = unwrap(
      await MembershipUpgradeRequestResource.createPending(adminAuth, {
        user: memberUser,
        reason: null,
      })
    );
    await request.markAsResolved(adminAuth, {
      status: "denied",
      resolvedByUser: adminAuth.getNonNullableUser(),
    });

    const result = await setUserSpendLimit(adminAuth, {
      userId: memberUser.sId,
      limit: { kind: "limited", awuCredits: 5_000 },
      auditContext: AUDIT_CONTEXT,
      requestId: request.sId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("request_invalid");
    }
    expect(perUserAlerts.upsertMetronomePerUserCapAlert).not.toHaveBeenCalled();
  });

  it("reverts both the membership override and the request grant snapshot when the Metronome sync fails", async () => {
    const { adminAuth, memberUser } = await setupWorkspaceWithAdminAndMember();
    const workspace = adminAuth.getNonNullableWorkspace();
    const request = unwrap(
      await MembershipUpgradeRequestResource.createPending(adminAuth, {
        user: memberUser,
        reason: null,
      })
    );

    // Simulate a previously-applied grant: the membership already carries an
    // override and the request already snapshots it.
    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user: memberUser,
        workspace,
      });
    if (!membership) {
      throw new Error("Expected an active membership.");
    }
    await membership.updatePoolCapOverride({
      poolCapOverrideAwuCredits: 3_000,
      poolCapOverrideExpiresAt: null,
    });
    await request.recordGrant({
      kind: "limited",
      awuCredits: 3_000,
      expiryKind: null,
    });

    vi.mocked(perUserAlerts.upsertMetronomePerUserCapAlert).mockResolvedValue(
      new Err(new Error("Metronome unavailable"))
    );

    const result = await setUserSpendLimit(adminAuth, {
      userId: memberUser.sId,
      limit: { kind: "limited", awuCredits: 9_000 },
      auditContext: AUDIT_CONTEXT,
      requestId: request.sId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("metronome_error");
    }

    const reloadedMembership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user: memberUser,
        workspace,
      });
    expect(reloadedMembership?.poolCapOverrideAwuCredits).toBe(3_000);

    const reloadedRequest = await MembershipUpgradeRequestResource.fetchById(
      adminAuth,
      request.sId
    );
    expect(reloadedRequest?.grantedAwuCredits).toBe(3_000);
    expect(reloadedRequest?.grantedUnlimitedSpend).toBe(false);
  });

  it("records the grant snapshot on the linked pending request when the update succeeds", async () => {
    const { adminAuth, memberUser } = await setupWorkspaceWithAdminAndMember();
    const request = unwrap(
      await MembershipUpgradeRequestResource.createPending(adminAuth, {
        user: memberUser,
        reason: null,
      })
    );

    const result = await setUserSpendLimit(adminAuth, {
      userId: memberUser.sId,
      limit: { kind: "limited", awuCredits: 5_000 },
      auditContext: AUDIT_CONTEXT,
      requestId: request.sId,
    });

    expect(result.isOk()).toBe(true);

    const reloadedRequest = await MembershipUpgradeRequestResource.fetchById(
      adminAuth,
      request.sId
    );
    expect(reloadedRequest?.grantedAwuCredits).toBe(5_000);
    expect(reloadedRequest?.grantedUnlimitedSpend).toBe(false);
  });
});
