import * as workosAudit from "@app/lib/api/audit/workos_audit";
import {
  MAX_GROUP_SPEND_LIMIT_AWU_CREDITS,
  setGroupSpendLimit,
} from "@app/lib/api/groups/spend_limit";
import { Authenticator } from "@app/lib/auth";
import * as groupCapAlert from "@app/lib/metronome/alerts/spend_limits";
import * as planType from "@app/lib/metronome/plan_type";
import * as seatTypes from "@app/lib/metronome/seat_types";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipSeatType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import type { Subscription } from "@metronome/sdk/resources";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<typeof groupCapAlert>(
    "@app/lib/metronome/alerts/spend_limits"
  );
  return {
    ...actual,
    upsertMetronomeGroupCapAlertForSeatType: vi.fn(),
    upsertMetronomeGroupWarningAlertForSeatType: vi.fn(),
    clearMetronomeGroupCapAlertForSeatType: vi.fn(),
    clearMetronomeGroupWarningAlertForSeatType: vi.fn(),
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

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<typeof planType>(
    "@app/lib/metronome/plan_type"
  );
  return {
    ...actual,
    getActiveContract: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<typeof seatTypes>(
    "@app/lib/metronome/seat_types"
  );
  return {
    ...actual,
    getProductSeatTypes: vi.fn(),
    getSeatSubscriptionsFromContract: vi.fn(),
    getAwuAllocationForNormalizedSeatType: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const AUDIT_CONTEXT = { location: "127.0.0.1" };

const FAKE_CONTRACT = {
  id: "contract_xxx",
  customer_id: METRONOME_CUSTOMER_ID,
  rate_card_id: "rc_xxx",
  subscriptions: [],
} as unknown as planType.CachedContract;

const FAKE_PRODUCT_SEAT_TYPES = new Map([["prod_pro", "pro" as const]]);
const FAKE_SEAT_SUBSCRIPTIONS = new Map<MembershipSeatType, Subscription>([
  [
    "pro",
    { subscription_rate: { product: { id: "prod_pro" } } } as Subscription,
  ],
]);

beforeEach(() => {
  vi.mocked(
    groupCapAlert.upsertMetronomeGroupCapAlertForSeatType
  ).mockResolvedValue(new Ok({ alertId: "alert_group_cap_xxx" }));
  vi.mocked(
    groupCapAlert.upsertMetronomeGroupWarningAlertForSeatType
  ).mockResolvedValue(new Ok({ alertId: "alert_group_warning_xxx" }));
  vi.mocked(
    groupCapAlert.clearMetronomeGroupCapAlertForSeatType
  ).mockResolvedValue(new Ok(undefined));
  vi.mocked(
    groupCapAlert.clearMetronomeGroupWarningAlertForSeatType
  ).mockResolvedValue(new Ok(undefined));
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);

  vi.mocked(planType.getActiveContract).mockResolvedValue(FAKE_CONTRACT);
  vi.mocked(seatTypes.getProductSeatTypes).mockResolvedValue(
    FAKE_PRODUCT_SEAT_TYPES
  );
  vi.mocked(seatTypes.getSeatSubscriptionsFromContract).mockReturnValue(
    FAKE_SEAT_SUBSCRIPTIONS
  );
  vi.mocked(seatTypes.getAwuAllocationForNormalizedSeatType).mockReturnValue(
    8000
  );
});

describe("setGroupSpendLimit", () => {
  it("persists the cap and upserts per-seat-type alerts with seat allowance added", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const group = await GroupResource.makeNew({
      name: "Sales",
      workspaceId: workspace.id,
      kind: "provisioned",
      workOSGroupId: "fake-sales",
    });

    const result = await setGroupSpendLimit(auth, {
      groupId: group.sId,
      limit: { kind: "limited", awuCredits: 25_000 },
      auditContext: AUDIT_CONTEXT,
    });

    expect(result.isOk()).toBe(true);

    // DB is the source of truth: the cap is persisted on the group.
    const reloaded = await GroupResource.fetchById(auth, group.sId);
    if (reloaded.isErr()) {
      throw reloaded.error;
    }
    expect(reloaded.value.poolCapAwuCredits).toBe(25_000);

    // Metronome threshold = 8_000 (seat) + 25_000 (group) = 33_000.
    expect(
      groupCapAlert.upsertMetronomeGroupCapAlertForSeatType
    ).toHaveBeenCalledWith({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: workspace.sId,
      groupId: group.sId,
      seatType: "pro",
      awuCredits: 33_000,
    });
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "group.spend_limit_updated",
        metadata: { kind: "limited", awu_credits: "25000" },
      })
    );
  });

  it("clears the alerts and the cap when set to unlimited", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const group = await GroupResource.makeNew({
      name: "Sales",
      workspaceId: workspace.id,
      kind: "provisioned",
      workOSGroupId: "fake-sales",
    });
    await group.updatePoolCap(25_000);

    const result = await setGroupSpendLimit(auth, {
      groupId: group.sId,
      limit: { kind: "unlimited" },
      auditContext: AUDIT_CONTEXT,
    });

    expect(result.isOk()).toBe(true);

    const reloaded = await GroupResource.fetchById(auth, group.sId);
    if (reloaded.isErr()) {
      throw reloaded.error;
    }
    expect(reloaded.value.poolCapAwuCredits).toBeNull();

    expect(
      groupCapAlert.clearMetronomeGroupCapAlertForSeatType
    ).toHaveBeenCalled();
    expect(
      groupCapAlert.upsertMetronomeGroupCapAlertForSeatType
    ).not.toHaveBeenCalled();
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "group.spend_limit_updated",
        metadata: { kind: "unlimited", awu_credits: "unlimited" },
      })
    );
  });

  it("rejects out-of-bounds thresholds with invalid_threshold", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const group = await GroupResource.makeNew({
      name: "Sales",
      workspaceId: workspace.id,
      kind: "provisioned",
      workOSGroupId: "fake-sales",
    });

    for (const awuCredits of [-1, MAX_GROUP_SPEND_LIMIT_AWU_CREDITS + 1, 1.5]) {
      const result = await setGroupSpendLimit(auth, {
        groupId: group.sId,
        limit: { kind: "limited", awuCredits },
        auditContext: AUDIT_CONTEXT,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_threshold");
      }
    }
    expect(
      groupCapAlert.upsertMetronomeGroupCapAlertForSeatType
    ).not.toHaveBeenCalled();
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("reverts the DB pool cap when the Metronome cap alert upsert fails", async () => {
    vi.mocked(
      groupCapAlert.upsertMetronomeGroupCapAlertForSeatType
    ).mockResolvedValue(new Err(new Error("Metronome unavailable")));

    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const group = await GroupResource.makeNew({
      name: "Sales",
      workspaceId: workspace.id,
      kind: "provisioned",
      workOSGroupId: "fake-sales",
    });
    await group.updatePoolCap(10_000);

    const result = await setGroupSpendLimit(auth, {
      groupId: group.sId,
      limit: { kind: "limited", awuCredits: 25_000 },
      auditContext: AUDIT_CONTEXT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("metronome_error");
    }

    const reloaded = await GroupResource.fetchById(auth, group.sId);
    if (reloaded.isErr()) {
      throw reloaded.error;
    }
    expect(reloaded.value.poolCapAwuCredits).toBe(10_000);
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });
});
