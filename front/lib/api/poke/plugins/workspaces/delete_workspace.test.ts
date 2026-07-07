import { deleteWorkspacePlugin } from "@app/lib/api/poke/plugins/workspaces/delete_workspace";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeleteWorkspace, mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockDeleteWorkspace: vi.fn(),
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/workspace", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/workspace")>();
  return { ...actual, deleteWorkspace: mockDeleteWorkspace };
});

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

beforeEach(() => {
  mockDeleteWorkspace.mockReset();
  mockEmitAuditLogEvent.mockReset();
  mockDeleteWorkspace.mockResolvedValue(new Ok(undefined));
  mockEmitAuditLogEvent.mockResolvedValue(undefined);
});

describe("deleteWorkspacePlugin.execute", () => {
  it("blocks deletion when the free-plan workspace still has an active Metronome contract", async () => {
    // Credit-priced free plan: `isFreePlan` is true, yet the active subscription
    // is Metronome-billed — the case the guard must catch.
    const workspace = await WorkspaceFactory.creditPricedFree();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await deleteWorkspacePlugin.execute(auth, workspace, {
      confirmation: "DELETE",
      workspaceHasBeenRelocated: false,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/active Metronome contract/i);
    }
    expect(mockDeleteWorkspace).not.toHaveBeenCalled();
  });

  it("proceeds when the workspace is on a free plan with no Metronome contract", async () => {
    const workspace = await WorkspaceFactory.byok();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await deleteWorkspacePlugin.execute(auth, workspace, {
      confirmation: "DELETE",
      workspaceHasBeenRelocated: false,
    });

    expect(result.isOk()).toBe(true);
    expect(mockDeleteWorkspace).toHaveBeenCalledTimes(1);
  });
});
