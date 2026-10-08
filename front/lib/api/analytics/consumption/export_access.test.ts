import { getConsumptionExportScope } from "@app/lib/api/analytics/consumption/export_access";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

describe("getConsumptionExportScope", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let globalGroup: GroupResource;
  let manualTarget: GroupResource;
  let provisionedTarget: GroupResource;
  let otherGroup: GroupResource;
  // A user-role key holding `read_analytics` on `manualTarget` and `provisionedTarget` only.
  let userKeyAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    ({ globalGroup } = await GroupFactory.defaults(workspace));
    manualTarget = await GroupFactory.regularManual(workspace, "Manual");
    provisionedTarget = await GroupFactory.provisioned(workspace, "SCIM");
    otherGroup = await GroupFactory.regularManual(workspace, "Other");

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const grantGroup = await GroupFactory.regularAuto(workspace, "Grant");
    for (const target of [manualTarget, provisionedTarget]) {
      await GroupPermissionResource.grant(adminAuth, {
        group: grantGroup,
        grantType: "analytics_reader",
        resourceType: "group",
        resourceId: target.id,
      });
    }
    const key = await KeyFactory.regular([globalGroup, grantGroup]);
    userKeyAuth = await Authenticator.fromKey(key, workspace.sId);
  });

  it("gives an admin key the whole workspace, with or without a filter", async () => {
    const key = await KeyFactory.admin(globalGroup);
    const auth = await Authenticator.fromKey(key, workspace.sId);

    for (const filter of [undefined, {}, { groups: [otherGroup.sId] }]) {
      const res = await getConsumptionExportScope(auth, filter);
      assert(res.isOk());
      expect(res.value).toEqual({ kind: "workspace" });
    }
  });

  it("restricts a key to the requested groups it can read", async () => {
    const res = await getConsumptionExportScope(userKeyAuth, {
      groups: [manualTarget.sId, provisionedTarget.sId, manualTarget.sId],
      agents: ["agent-1"],
    });

    assert(res.isOk());
    expect(res.value).toEqual({
      kind: "groups",
      groupIds: new Set([manualTarget.sId, provisionedTarget.sId]),
    });
  });

  it("rejects a non-admin key without a group filter", async () => {
    for (const filter of [undefined, {}, { groups: [] }, { agents: ["a"] }]) {
      const res = await getConsumptionExportScope(userKeyAuth, filter);
      expect(res.isErr() && res.error.code).toBe("unauthorized");
    }
  });

  it("rejects an empty group id, which would drop the group filter", async () => {
    for (const groups of [[""], [manualTarget.sId, ""]]) {
      const res = await getConsumptionExportScope(userKeyAuth, { groups });
      expect(res.isErr() && res.error.code).toBe("unauthorized");
    }
  });

  it("rejects when any requested group is not readable", async () => {
    const regularAuto = await GroupFactory.regularAuto(workspace, "Auto");
    for (const groupId of [
      otherGroup.sId,
      globalGroup.sId,
      regularAuto.sId,
      "grp_unknown",
    ]) {
      const res = await getConsumptionExportScope(userKeyAuth, {
        groups: [manualTarget.sId, groupId],
      });
      expect(res.isErr() && res.error.code).toBe("unauthorized");
    }
  });
});
