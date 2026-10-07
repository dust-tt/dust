import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { emitManualGroupLifecycleAuditLog } from "@app/lib/api/groups/audit";
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

beforeEach(() => {
  vi.mocked(workosAudit.emitAuditLogEvent).mockReset();
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
});

describe("emitManualGroupLifecycleAuditLog", () => {
  async function setup() {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const group = await GroupResource.makeNew({
      name: "Sales",
      workspaceId: workspace.id,
      kind: "regular_manual",
    });
    const owner = auth.getNonNullableWorkspace();
    return { auth, group, owner };
  }

  it("emits group.created with member and manager counts", async () => {
    const { auth, group, owner } = await setup();

    emitManualGroupLifecycleAuditLog(auth, {
      kind: "created",
      group,
      memberCount: 2,
      managerCount: 1,
    });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith({
      auth,
      action: "group.created",
      targets: [
        { type: "workspace", id: owner.sId, name: owner.name },
        { type: "group", id: group.sId, name: "Sales" },
      ],
      context: { location: "internal" },
      metadata: {
        group_name: "Sales",
        member_count: "2",
        manager_count: "1",
      },
    });
  });

  it("emits group.deleted with the member count", async () => {
    const { auth, group, owner } = await setup();

    emitManualGroupLifecycleAuditLog(auth, {
      kind: "deleted",
      group,
      memberCount: 3,
    });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith({
      auth,
      action: "group.deleted",
      targets: [
        { type: "workspace", id: owner.sId, name: owner.name },
        { type: "group", id: group.sId, name: "Sales" },
      ],
      context: { location: "internal" },
      metadata: {
        group_name: "Sales",
        member_count: "3",
      },
    });
  });

  it("emits group.name_updated only when the previous name is set", async () => {
    const { auth, group, owner } = await setup();

    emitManualGroupLifecycleAuditLog(auth, {
      kind: "name_updated",
      group,
      previousName: null,
    });
    expect(workosAudit.emitAuditLogEvent).not.toHaveBeenCalled();

    emitManualGroupLifecycleAuditLog(auth, {
      kind: "name_updated",
      group,
      previousName: "Old Sales",
    });
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith({
      auth,
      action: "group.name_updated",
      targets: [
        { type: "workspace", id: owner.sId, name: owner.name },
        { type: "group", id: group.sId, name: "Sales" },
      ],
      context: { location: "internal" },
      metadata: {
        previous_name: "Old Sales",
        new_name: "Sales",
      },
    });
  });
});
