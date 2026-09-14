import * as workosAudit from "@app/lib/api/audit/workos_audit";
import {
  getProgrammaticUsageLimit,
  syncProgrammaticUsageLimit,
} from "@app/lib/api/credits/programmatic_usage_limit";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
});

describe("syncProgrammaticUsageLimit persistence", () => {
  it("persists the cap to the configuration as the source of truth", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 500 });

    const read = await getProgrammaticUsageLimit(auth);
    expect(read.isOk() && read.value).toBe(500);
  });

  it("persists 0 as a hard cap (cap of 0 is always depleted)", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 0 });

    const read = await getProgrammaticUsageLimit(auth);
    expect(read.isOk() && read.value).toBe(0);
  });

  it("resets to 0 (no access)", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 500 });
    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 0 });

    const read = await getProgrammaticUsageLimit(auth);
    expect(read.isOk() && read.value).toBe(0);
  });

  it("clamps a negative cap to 0", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: -5 });

    const read = await getProgrammaticUsageLimit(auth);
    expect(read.isOk() && read.value).toBe(0);
  });
});

describe("syncProgrammaticUsageLimit audit", () => {
  it("emits an audit event with previous and new cap", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Seed a previous cap, then ignore its audit emission.
    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 200 });
    vi.mocked(workosAudit.emitAuditLogEvent).mockClear();

    await syncProgrammaticUsageLimit({
      auth,
      monthlyCapCredits: 500,
      auditContext: AUDIT_CONTEXT,
    });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "workspace.programmatic_usage_limit_updated",
        metadata: {
          previous_monthly_cap_credits: "200",
          new_monthly_cap_credits: "500",
        },
      })
    );
  });

  it("records previous as '0' when no cap existed", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncProgrammaticUsageLimit({
      auth,
      monthlyCapCredits: 1000,
      auditContext: AUDIT_CONTEXT,
    });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          previous_monthly_cap_credits: "0",
          new_monthly_cap_credits: "1000",
        },
      })
    );
  });

  it("records new as '0' when blocking access (cap set to 0)", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 500 });
    vi.mocked(workosAudit.emitAuditLogEvent).mockClear();

    await syncProgrammaticUsageLimit({
      auth,
      monthlyCapCredits: 0,
      auditContext: AUDIT_CONTEXT,
    });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          previous_monthly_cap_credits: "500",
          new_monthly_cap_credits: "0",
        },
      })
    );
  });
});
