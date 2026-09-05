import * as workosAudit from "@app/lib/api/audit/workos_audit";
import {
  getDefaultUserSpendLimit,
  setDefaultUserSpendLimit,
} from "@app/lib/api/workspace/default_user_spend_limit";
import { Authenticator } from "@app/lib/auth";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS } from "@app/types/credits";
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

describe("getDefaultUserSpendLimit", () => {
  it("returns the configured workspace default pool cap", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      defaultPoolCapAwuCredits: 25_000,
    });

    const result = await getDefaultUserSpendLimit(auth);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ awuCredits: 25_000 });
    }
  });

  it("returns 0 when no workspace default is configured (no plan-tier fallback, no unlimited)", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await getDefaultUserSpendLimit(auth);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ awuCredits: 0 });
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
  });
});

describe("setDefaultUserSpendLimit", () => {
  it("persists the pool cap to the configuration as the source of truth", async () => {
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
    const config =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
    expect(config?.defaultPoolCapAwuCredits).toBe(25_000);
  });

  it("emits an audit event with previous and new pool limits", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      defaultPoolCapAwuCredits: 10_000,
    });

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

  it("records previous_awu_credits as '0' when no default existed", async () => {
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
          previous_awu_credits: "0",
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

    for (const awuCredits of [
      -1,
      MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS + 1,
      1.5,
    ]) {
      const result = await setDefaultUserSpendLimit(auth, {
        awuCredits,
        auditContext: AUDIT_CONTEXT,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_threshold");
      }
    }
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
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });
});
