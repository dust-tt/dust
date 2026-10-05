import assert from "node:assert";

import { createGroupPlugin } from "@app/lib/api/poke/plugins/workspaces/create_group";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: vi.fn().mockResolvedValue(undefined) };
});

describe("createGroupPlugin.execute", () => {
  it("creates the group with every listed member", async () => {
    const workspace = await WorkspaceFactory.basic();
    const alice = await UserFactory.withEmail("alice@example.com");
    const bob = await UserFactory.withEmail("bob@example.com");
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    await MembershipFactory.associate(workspace, bob, { role: "user" });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await createGroupPlugin.execute(auth, workspace, {
      name: " Sales ",
      emails: "Alice@example.com,\nbob@example.com",
    });

    expect(result.isOk()).toBe(true);
    const groups = await GroupResource.listAllWorkspaceGroups(auth, {
      groupKinds: ["regular_manual"],
    });
    const group = groups.find((g) => g.name === "Sales");
    assert(group, "group should have been created");
    const members = await group.getActiveMembers(auth);
    expect(members.map((m) => m.sId).sort()).toEqual(
      [alice.sId, bob.sId].sort()
    );
  });

  it("rejects when a group with the same name already exists", async () => {
    const workspace = await WorkspaceFactory.basic();
    const alice = await UserFactory.withEmail("alice@example.com");
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const args = { name: "Sales", emails: "alice@example.com" };

    const first = await createGroupPlugin.execute(auth, workspace, args);
    const second = await createGroupPlugin.execute(auth, workspace, args);

    expect(first.isOk()).toBe(true);
    assert(second.isErr(), "expected an error");
    expect(second.error.message).toContain("already exists");
  });

  it("rejects without creating the group when an email is not a workspace member", async () => {
    const workspace = await WorkspaceFactory.basic();
    const alice = await UserFactory.withEmail("alice@example.com");
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    await UserFactory.withEmail("outsider@example.com");
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await createGroupPlugin.execute(auth, workspace, {
      name: "Sales",
      emails: "alice@example.com, outsider@example.com",
    });

    assert(result.isErr(), "expected an error");
    expect(result.error.message).toContain("outsider@example.com");
    expect(await GroupResource.groupExistsByName(auth, "Sales")).toBe(false);
  });
});
