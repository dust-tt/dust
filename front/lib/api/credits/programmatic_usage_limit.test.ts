import * as workosAudit from "@app/lib/api/audit/workos_audit";
import {
  getProgrammaticUsageLimit,
  syncProgrammaticUsageLimit,
} from "@app/lib/api/credits/programmatic_usage_limit";
import { Authenticator } from "@app/lib/auth";
import * as programmaticCap from "@app/lib/metronome/alerts/programmatic_cap";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts/programmatic_cap", async () => {
  const actual = await vi.importActual<typeof programmaticCap>(
    "@app/lib/metronome/alerts/programmatic_cap"
  );
  return {
    ...actual,
    upsertMetronomeProgrammaticCapAlerts: vi.fn(),
    clearMetronomeProgrammaticCapAlerts: vi.fn(),
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
    programmaticCap.upsertMetronomeProgrammaticCapAlerts
  ).mockResolvedValue(new Ok(undefined));
  vi.mocked(
    programmaticCap.clearMetronomeProgrammaticCapAlerts
  ).mockResolvedValue(new Ok(undefined));
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
    expect(
      programmaticCap.upsertMetronomeProgrammaticCapAlerts
    ).toHaveBeenCalled();
  });

  it("persists 0 as a hard cap rather than clearing it", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 0 });

    const read = await getProgrammaticUsageLimit(auth);
    expect(read.isOk() && read.value).toBe(0);
    expect(
      programmaticCap.upsertMetronomeProgrammaticCapAlerts
    ).toHaveBeenCalled();
    expect(
      programmaticCap.clearMetronomeProgrammaticCapAlerts
    ).not.toHaveBeenCalled();
  });

  it("clears the cap and the alerts when set to null", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 500 });
    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: null });

    const read = await getProgrammaticUsageLimit(auth);
    expect(read.isOk() && read.value).toBe(null);
    expect(
      programmaticCap.clearMetronomeProgrammaticCapAlerts
    ).toHaveBeenCalled();
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

  it("records previous as 'unset' when no cap existed", async () => {
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
          previous_monthly_cap_credits: "unset",
          new_monthly_cap_credits: "1000",
        },
      })
    );
  });

  it("records new as 'unset' when clearing the cap", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await syncProgrammaticUsageLimit({ auth, monthlyCapCredits: 500 });
    vi.mocked(workosAudit.emitAuditLogEvent).mockClear();

    await syncProgrammaticUsageLimit({
      auth,
      monthlyCapCredits: null,
      auditContext: AUDIT_CONTEXT,
    });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          previous_monthly_cap_credits: "500",
          new_monthly_cap_credits: "unset",
        },
      })
    );
  });

  it("skips audit when upsert fails", async () => {
    const workspace = await WorkspaceFactory.creditPriced({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(
      programmaticCap.upsertMetronomeProgrammaticCapAlerts
    ).mockResolvedValue(new Err(new Error("metronome down")));

    const result = await syncProgrammaticUsageLimit({
      auth,
      monthlyCapCredits: 500,
      auditContext: AUDIT_CONTEXT,
    });

    expect(result.isErr()).toBe(true);
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });
});
