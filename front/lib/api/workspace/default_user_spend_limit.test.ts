import * as workosAudit from "@app/lib/api/audit/workos_audit";
import {
  getDefaultUserSpendLimit,
  setDefaultUserSpendLimit,
} from "@app/lib/api/workspace/default_user_spend_limit";
import { Authenticator } from "@app/lib/auth";
import * as defaultUserCapAlert from "@app/lib/metronome/alerts/spend_limits";
import { buildCustomerAlertMock } from "@app/tests/utils/metronome_alerts";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<typeof defaultUserCapAlert>(
    "@app/lib/metronome/alerts/spend_limits"
  );
  return {
    ...actual,
    getMetronomeDefaultUserCapAlert: vi.fn(),
    upsertMetronomeDefaultUserCapAlert: vi.fn(),
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

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const AUDIT_CONTEXT = { location: "127.0.0.1" };

beforeEach(() => {
  vi.mocked(
    defaultUserCapAlert.getMetronomeDefaultUserCapAlert
  ).mockResolvedValue(new Ok(null));
  vi.mocked(
    defaultUserCapAlert.upsertMetronomeDefaultUserCapAlert
  ).mockResolvedValue(new Ok({ alertId: "alert_default_xxx" }));
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
});

describe("getDefaultUserSpendLimit", () => {
  it("returns the configured threshold", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlert
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
      expect(result.value).toEqual({ awuCredits: 50_000 });
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
    // Should not even talk to Metronome when the workspace isn't billed there.
    expect(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlert
    ).not.toHaveBeenCalled();
  });

  it("surfaces Metronome errors as metronome_error", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlert
    ).mockResolvedValue(new Err(new Error("metronome down")));

    const result = await getDefaultUserSpendLimit(auth);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("metronome_error");
    }
  });
});

describe("setDefaultUserSpendLimit", () => {
  it("upserts the alert with the new threshold and returns the updated value", async () => {
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
    expect(
      defaultUserCapAlert.upsertMetronomeDefaultUserCapAlert
    ).toHaveBeenCalledWith({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      workspaceId: workspace.sId,
      awuCredits: 25_000,
    });
  });

  it("emits an audit event with previous and new thresholds", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      defaultUserCapAlert.getMetronomeDefaultUserCapAlert
    ).mockResolvedValue(
      new Ok(
        buildCustomerAlertMock({
          id: "alert_default_xxx",
          threshold: 10_000,
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
    // No Metronome side effects on validation failures.
    expect(
      defaultUserCapAlert.upsertMetronomeDefaultUserCapAlert
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
      defaultUserCapAlert.upsertMetronomeDefaultUserCapAlert
    ).not.toHaveBeenCalled();
  });

  it("surfaces upsert failures as metronome_error and skips audit", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      defaultUserCapAlert.upsertMetronomeDefaultUserCapAlert
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
