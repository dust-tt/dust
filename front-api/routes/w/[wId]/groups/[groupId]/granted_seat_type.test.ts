import { GroupResource } from "@app/lib/resources/group_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function makeProvisionedGroup(
  workspace: WorkspaceType
): Promise<GroupResource> {
  return GroupResource.makeNew({
    name: "Sales",
    workspaceId: workspace.id,
    kind: "provisioned",
    workOSGroupId: "fake-sales",
  });
}

function grantedSeatTypeUrl(wId: string, groupId: string) {
  return `/api/w/${wId}/groups/${groupId}/granted_seat_type`;
}

function putGrantedSeatType(
  wId: string,
  groupId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(grantedSeatTypeUrl(wId, groupId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/w/[wId]/groups/[groupId]/granted_seat_type", () => {
  it("returns 403 when caller is a manager (admin only)", async () => {
    const workspace = await WorkspaceFactory.basic();
    const group = await makeProvisionedGroup(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "manager",
      workspace,
    });

    const response = await putGrantedSeatType(workspace.sId, group.sId, {
      grantedSeatType: "pro",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("lets an admin map a group to a seat type and clear it", async () => {
    const workspace = await WorkspaceFactory.basic();
    const group = await makeProvisionedGroup(workspace);
    const { auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const setResponse = await putGrantedSeatType(workspace.sId, group.sId, {
      grantedSeatType: "pro",
    });
    expect(setResponse.status).toBe(200);

    let reloaded = await GroupResource.fetchById(auth, group.sId);
    if (reloaded.isErr()) {
      throw reloaded.error;
    }
    expect(reloaded.value.grantedSeatType).toBe("pro");

    const clearResponse = await putGrantedSeatType(workspace.sId, group.sId, {
      grantedSeatType: null,
    });
    expect(clearResponse.status).toBe(200);

    reloaded = await GroupResource.fetchById(auth, group.sId);
    if (reloaded.isErr()) {
      throw reloaded.error;
    }
    expect(reloaded.value.grantedSeatType).toBeNull();
  });

  it("returns 400 for a non-manageable group kind", async () => {
    // The global group is readable by all members but is not a manageable kind,
    // so it reaches `setGrantedSeatType`'s kind check (unlike internal groups
    // such as regular_auto, which are not readable and would 403 at fetch).
    const workspace = await WorkspaceFactory.basic();
    const { auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });
    const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (globalGroupRes.isErr()) {
      throw globalGroupRes.error;
    }

    const response = await putGrantedSeatType(
      workspace.sId,
      globalGroupRes.value.sId,
      { grantedSeatType: "pro" }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 on an invalid seat type value", async () => {
    const workspace = await WorkspaceFactory.basic();
    const group = await makeProvisionedGroup(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putGrantedSeatType(workspace.sId, group.sId, {
      grantedSeatType: "free",
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the group belongs to another workspace", async () => {
    const workspace = await WorkspaceFactory.basic();
    const otherWorkspace = await WorkspaceFactory.basic();
    const otherGroup = await makeProvisionedGroup(otherWorkspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putGrantedSeatType(workspace.sId, otherGroup.sId, {
      grantedSeatType: "pro",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });
});
