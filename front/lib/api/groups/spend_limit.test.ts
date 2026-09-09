import * as workosAudit from "@app/lib/api/audit/workos_audit";
import {
  MAX_GROUP_SPEND_LIMIT_AWU_CREDITS,
  setGroupSpendLimit,
} from "@app/lib/api/groups/spend_limit";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
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

describe("setGroupSpendLimit", () => {
  it("persists the cap on the group as the source of truth", async () => {
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

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "group.spend_limit_updated",
        metadata: { kind: "limited", awu_credits: "25000" },
      })
    );
  });

  it("clears the cap when set to unlimited", async () => {
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
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();
  });
});
