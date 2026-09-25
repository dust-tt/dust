import { Authenticator } from "@app/lib/auth";
import {
  getMemberScopeWithGroupVerb,
  hasGroupVerbForMember,
  listGroupsWithVerb,
} from "@app/lib/resources/group_management_access";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

describe("group management scope", () => {
  it("deduplicates active members and checks current group membership", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const delegate = await UserFactory.basic();
    const member = await UserFactory.basic();
    const overlap = await UserFactory.basic();
    const former = await UserFactory.basic();
    const outsider = await UserFactory.basic();
    for (const user of [delegate, member, overlap, former, outsider]) {
      await MembershipFactory.associate(workspace, user, { role: "user" });
    }
    const first = await GroupResource.makeNew(
      { name: "First", kind: "regular_manual", workspaceId: workspace.id },
      { memberIds: [member.id, overlap.id, former.id] }
    );
    const second = await GroupResource.makeNew(
      { name: "Second", kind: "regular_manual", workspaceId: workspace.id },
      { memberIds: [overlap.id] }
    );
    for (const group of [first, second]) {
      const result = await GroupPermissionResource.grantToUser(adminAuth, {
        user: delegate.toJSON(),
        grantType: "group_manager",
        resourceType: "group",
        resourceId: group.id,
      });
      expect(result.isOk()).toBe(true);
    }
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      delegate.sId,
      workspace.sId
    );

    const scope = await getMemberScopeWithGroupVerb(auth, "read_usage");
    expect(scope.kind).toBe("ids");
    if (scope.kind === "ids") {
      expect(new Set(scope.memberModelIds)).toEqual(
        new Set([member.id, overlap.id, former.id])
      );
    }
    expect(await hasGroupVerbForMember(auth, member, "set_usage_limits")).toBe(
      true
    );
    expect(
      await hasGroupVerbForMember(auth, outsider, "set_usage_limits")
    ).toBe(false);

    const removed = await first.dangerouslyRemoveMembers(adminAuth, {
      users: [member.toJSON()],
    });
    expect(removed.isOk()).toBe(true);
    expect(await hasGroupVerbForMember(auth, member, "set_usage_limits")).toBe(
      false
    );

    const revoked = await MembershipResource.revokeMembership({
      user: former,
      workspace,
    });
    expect(revoked.isOk()).toBe(true);
    expect(await hasGroupVerbForMember(auth, former, "set_usage_limits")).toBe(
      false
    );
    const remainingScope = await getMemberScopeWithGroupVerb(
      auth,
      "read_usage"
    );
    expect(remainingScope.kind).toBe("ids");
    if (remainingScope.kind === "ids") {
      expect(remainingScope.memberModelIds).toEqual([overlap.id]);
    }
  });

  it("handles empty scopes, type-wide grants, and admin-group write restrictions", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const delegate = await UserFactory.basic();
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, delegate, { role: "user" });
    await MembershipFactory.associate(workspace, member, { role: "user" });
    const manual = await GroupResource.makeNew(
      { name: "Manual", kind: "regular_manual", workspaceId: workspace.id },
      { memberIds: [member.id] }
    );
    const adminGroup = await GroupResource.makeNew({
      name: "Admins",
      kind: "regular_manual",
      workspaceId: workspace.id,
      grantedRole: "admin",
    });
    const provisioned = await GroupResource.makeNew(
      {
        name: "Directory",
        kind: "provisioned",
        workspaceId: workspace.id,
        workOSGroupId: "directory",
      },
      { memberIds: [member.id] }
    );
    let auth = await Authenticator.fromUserIdAndWorkspaceId(
      delegate.sId,
      workspace.sId
    );
    expect(await listGroupsWithVerb(auth, "set_usage_limits")).toEqual([]);
    expect(await getMemberScopeWithGroupVerb(auth, "read_usage")).toEqual({
      kind: "ids",
      memberModelIds: [],
    });

    const grantGroup = await GroupResource.makeNew(
      {
        name: "All group managers",
        kind: "regular_auto",
        workspaceId: workspace.id,
      },
      { memberIds: [delegate.id] }
    );
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group: grantGroup,
      grantType: "group_manager",
      resourceType: "group",
    });
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      delegate.sId,
      workspace.sId
    );
    expect((await listGroupsWithVerb(auth, "write")).map((g) => g.id)).toEqual([
      manual.id,
    ]);
    expect(
      new Set(
        (await listGroupsWithVerb(auth, "set_usage_limits")).map((g) => g.id)
      )
    ).toEqual(new Set([manual.id, adminGroup.id, provisioned.id]));
    expect(await hasGroupVerbForMember(auth, member, "read_usage")).toBe(true);
    expect(await getMemberScopeWithGroupVerb(adminAuth, "read_usage")).toEqual({
      kind: "all",
    });
    const manager = await UserFactory.basic();
    await MembershipFactory.associate(workspace, manager, { role: "manager" });
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      manager.sId,
      workspace.sId
    );
    expect(
      await getMemberScopeWithGroupVerb(managerAuth, "read_usage")
    ).toEqual({ kind: "all" });
  });
});
