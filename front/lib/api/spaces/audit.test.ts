import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { emitSpaceNameUpdatedAuditLog } from "@app/lib/api/spaces/audit";
import { Authenticator } from "@app/lib/auth";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
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

describe("emitSpaceNameUpdatedAuditLog", () => {
  it("emits space.name_updated with the previous name, new name, and kind", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const space = await SpaceFactory.regular(workspace);
    const owner = auth.getNonNullableWorkspace();

    emitSpaceNameUpdatedAuditLog(auth, space, "Old space");

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith({
      auth,
      action: "space.name_updated",
      targets: [
        { type: "workspace", id: owner.sId, name: owner.name },
        { type: "space", id: space.sId, name: space.name },
      ],
      context: { location: "internal" },
      metadata: {
        previous_name: "Old space",
        new_name: space.name,
        space_kind: "regular",
      },
    });
  });
});
