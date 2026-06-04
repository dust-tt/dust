import * as workosAudit from "@app/lib/api/audit/workos_audit";
import {
  getDefaultUserSpendLimit,
  setDefaultUserSpendLimit,
} from "@app/lib/api/workspace/default_user_spend_limit";
import { Authenticator } from "@app/lib/auth";
import * as defaultUserCapAlert from "@app/lib/metronome/alerts/spend_limits";
import * as planType from "@app/lib/metronome/plan_type";
import * as seatTypes from "@app/lib/metronome/seat_types";
import { buildCustomerAlertMock } from "@app/tests/utils/metronome_alerts";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipSeatType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import type { Subscription } from "@metronome/sdk/resources";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<typeof defaultUserCapAlert>(
    "@app/lib/metronome/alerts/spend_limits"
  );
  return {
    ...actual,
    getMetronomeDefaultUserCapAlertForSeatType: vi.fn(),
    upsertMetronomeDefaultUserCapAlertForSeatType: vi.fn(),
    upsertMetronomeDefaultUserWarningAlertForSeatType: vi.fn(),
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
    getAwuAllocationForSeatType: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const AUDIT_CONTEXT = { location: "127.0.0.1" };

// Minimal fake contract and seat type setup.
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
    defaultUserCapAlert.getMetronomeDefaultUserCapAlertForSeatType
  ).mockResolvedValue(new Ok(null));
  vi.mocked(
    defaultUserCapAlert.upsertMetronomeDefaultUserCapAlertForSeatType
  ).mockResolvedValue(new Ok({ alertId: "alert_default_xxx" }));
  vi.mocked(
    defaultUserCapAlert.upsertMetronomeDefaultUserWarningAlertForSeatType
  ).mockResolvedValue(new Ok({ alertId: "alert_warning_xxx" }));
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);

  // Contract + seat type mocks for setDefaultUserSpendLimit.
  vi.mocked(planType.getActiveContract).mockResolvedValue(FAKE_CONTRACT);
  vi.mocked(seatTypes.getProductSeatTypes).mockResolvedValue(
    FAKE_PRODUCT_SEAT_TYPES
  );
  vi.mocked(seatTypes.getSeatSubscriptionsFromContract).mockReturnValue(
    FAKE_SEAT_SUBSCRIPTIONS
  );
  vi.mocked(seatTypes.getAwuAllocationForSeatType).mockReturnValue(8000);
});

describe("getDefaultUserSpendLimit", () => {
  it("returns the configured threshold minus seat allowance", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlertForSeatType
    ).mockResolvedValue(
      new Ok(
        buildCustomerAlertMock({
          id: "alert_default_xxx",
          threshold: 50_000,
          customerStatus: "ok",
        })
      )
    );

    const result = await getDefaultUserSpendLimit(auth);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // 50_000 (Metronome threshold) - 8_000 (seat allowance) = 42_000
      expect(result.value).toEqual({ awuCredits: 42_000 });
    }
  });

  it("returns not_found when no default is configured", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await getDefaultUserSpendLimit(auth);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_found");
    }
  });

  it("returns workspace_not_metronome_billed when no customerId", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await getDefaultUserSpendLimit(auth);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("workspace_not_metronome_billed");
    }
    expect(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlertForSeatType
    ).not.toHaveBeenCalled();
  });

  it("surfaces Metronome errors as metronome_error", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlertForSeatType
    ).mockResolvedValue(new Err(new Error("metronome down")));

    const result = await getDefaultUserSpendLimit(auth);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("metronome_error");
    }
  });
});

describe("setDefaultUserSpendLimit", () => {
  it("upserts per-seat-type alert with seat allowance added to pool limit", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await setDefaultUserSpendLimit(auth, {
      awuCredits: 25_000,
      auditContext: AUDIT_CONTEXT,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ awuCredits: 25_000 });
    }
    // Metronome threshold = 8_000 (seat) + 25_000 (pool) = 33_000
    expect(
      defaultUserCapAlert.upsertMetronomeDefaultUserCapAlertForSeatType
    ).toHaveBeenCalledWith({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: workspace.sId,
      seatType: "pro",
      awuCredits: 33_000,
    });
  });

  it("emits an audit event with previous and new pool limits", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlertForSeatType
    ).mockResolvedValue(
      new Ok(
        buildCustomerAlertMock({
          id: "alert_default_xxx",
          threshold: 18_000, // 8_000 seat + 10_000 pool
          customerStatus: "ok",
        })
      )
    );

    await setDefaultUserSpendLimit(auth, {
      awuCredits: 25_000,
      auditContext: AUDIT_CONTEXT,
    });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "workspace.default_user_spend_limit_updated",
        metadata: {
          previous_awu_credits: "10000",
          new_awu_credits: "25000",
        },
      })
    );
  });

  it("records previous_awu_credits as 'unset' when no default existed", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await setDefaultUserSpendLimit(auth, {
      awuCredits: 1000,
      auditContext: AUDIT_CONTEXT,
    });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          previous_awu_credits: "unset",
          new_awu_credits: "1000",
        },
      })
    );
  });

  it("rejects out-of-bounds thresholds with invalid_threshold", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    for (const awuCredits of [0, -1, 1_000_001, 1.5]) {
      const result = await setDefaultUserSpendLimit(auth, {
        awuCredits,
        auditContext: AUDIT_CONTEXT,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_threshold");
      }
    }
    expect(
      defaultUserCapAlert.upsertMetronomeDefaultUserCapAlertForSeatType
    ).not.toHaveBeenCalled();
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("returns workspace_not_metronome_billed when the workspace has no customerId", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await setDefaultUserSpendLimit(auth, {
      awuCredits: 1000,
      auditContext: AUDIT_CONTEXT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("workspace_not_metronome_billed");
    }
    expect(
      defaultUserCapAlert.upsertMetronomeDefaultUserCapAlertForSeatType
    ).not.toHaveBeenCalled();
  });

  it("returns contract_not_found when no active contract exists", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(planType.getActiveContract).mockResolvedValue(null);

    const result = await setDefaultUserSpendLimit(auth, {
      awuCredits: 1000,
      auditContext: AUDIT_CONTEXT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("contract_not_found");
    }
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("surfaces upsert failures as metronome_error and skips audit", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      defaultUserCapAlert.upsertMetronomeDefaultUserCapAlertForSeatType
    ).mockResolvedValue(new Err(new Error("metronome down")));

    const result = await setDefaultUserSpendLimit(auth, {
      awuCredits: 1000,
      auditContext: AUDIT_CONTEXT,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("metronome_error");
    }
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });
});
