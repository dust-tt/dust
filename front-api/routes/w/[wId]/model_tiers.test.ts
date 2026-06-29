import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function workspaceModelTierUrl(wId: string) {
  return `/api/w/${wId}/model_tiers`;
}

function membersModelTiersUrl(wId: string) {
  return `/api/w/${wId}/model_tiers/members`;
}

function memberModelTierUrl(wId: string, uId: string) {
  return `/api/w/${wId}/model_tiers/members/${uId}`;
}

function groupsModelTiersUrl(wId: string) {
  return `/api/w/${wId}/model_tiers/groups`;
}

function groupModelTierUrl(wId: string, groupId: string) {
  return `/api/w/${wId}/model_tiers/groups/${groupId}`;
}

describe("/api/w/:wId/model_tiers", () => {
  it("returns 403 for non-admin callers", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(
      workspaceModelTierUrl(workspace.sId)
    );
    expect(response.status).toBe(403);
  });

  it("gets, sets, and clears the workspace default tier", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const initial = await honoApp.request(workspaceModelTierUrl(workspace.sId));
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({ tier: null });

    const setResponse = await honoApp.request(
      workspaceModelTierUrl(workspace.sId),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "balanced" }),
      }
    );
    expect(setResponse.status).toBe(200);
    expect(await setResponse.json()).toEqual({ tier: "balanced" });

    const getResponse = await honoApp.request(
      workspaceModelTierUrl(workspace.sId)
    );
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({ tier: "balanced" });

    const clearResponse = await honoApp.request(
      workspaceModelTierUrl(workspace.sId),
      { method: "DELETE" }
    );
    expect(clearResponse.status).toBe(200);
    expect(await clearResponse.json()).toEqual({ cleared: true });
  });
});

describe("/api/w/:wId/model_tiers/members", () => {
  it("returns all member tier overrides", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const member1 = await UserFactory.basic();
    const member2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member1, { role: "user" });
    await MembershipFactory.associate(workspace, member2, { role: "user" });

    const emptyResponse = await honoApp.request(
      membersModelTiersUrl(workspace.sId)
    );
    expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toEqual({ tiers: {} });

    await honoApp.request(memberModelTierUrl(workspace.sId, member1.sId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "fast" }),
    });
    await honoApp.request(memberModelTierUrl(workspace.sId, member2.sId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "powerful" }),
    });

    const listResponse = await honoApp.request(
      membersModelTiersUrl(workspace.sId)
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      tiers: {
        [member1.sId]: "fast",
        [member2.sId]: "powerful",
      },
    });
  });
});

describe("/api/w/:wId/model_tiers/members/:uId", () => {
  it("sets and clears a member tier override", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });

    const setResponse = await honoApp.request(
      memberModelTierUrl(workspace.sId, member.sId),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "fast" }),
      }
    );
    expect(setResponse.status).toBe(200);
    expect(await setResponse.json()).toEqual({ tier: "fast" });

    const listResponse = await honoApp.request(
      membersModelTiersUrl(workspace.sId)
    );
    expect(await listResponse.json()).toEqual({
      tiers: { [member.sId]: "fast" },
    });

    const clearResponse = await honoApp.request(
      memberModelTierUrl(workspace.sId, member.sId),
      { method: "DELETE" }
    );
    expect(clearResponse.status).toBe(200);
    expect(await clearResponse.json()).toEqual({ cleared: true });

    const clearedListResponse = await honoApp.request(
      membersModelTiersUrl(workspace.sId)
    );
    expect(await clearedListResponse.json()).toEqual({ tiers: {} });
  });

  it("returns 404 when the member is not in the workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const outsider = await UserFactory.basic();

    const response = await honoApp.request(
      memberModelTierUrl(workspace.sId, outsider.sId),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "fast" }),
      }
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("workspace_user_not_found");
  });
});

describe("/api/w/:wId/model_tiers/groups", () => {
  it("returns all group tier overrides", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const group1 = await GroupFactory.regular(workspace, "Engineering");
    const group2 = await GroupFactory.regular(workspace, "Design");

    const emptyResponse = await honoApp.request(
      groupsModelTiersUrl(workspace.sId)
    );
    expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toEqual({ tiers: {} });

    await honoApp.request(groupModelTierUrl(workspace.sId, group1.sId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "powerful" }),
    });
    await honoApp.request(groupModelTierUrl(workspace.sId, group2.sId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "balanced" }),
    });

    const listResponse = await honoApp.request(
      groupsModelTiersUrl(workspace.sId)
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      tiers: {
        [group1.sId]: "powerful",
        [group2.sId]: "balanced",
      },
    });
  });
});

describe("/api/w/:wId/model_tiers/groups/:groupId", () => {
  it("sets and clears a group tier override", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const group = await GroupFactory.regular(workspace, "Engineering");

    const setResponse = await honoApp.request(
      groupModelTierUrl(workspace.sId, group.sId),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "powerful" }),
      }
    );
    expect(setResponse.status).toBe(200);
    expect(await setResponse.json()).toEqual({ tier: "powerful" });

    const listResponse = await honoApp.request(
      groupsModelTiersUrl(workspace.sId)
    );
    expect(await listResponse.json()).toEqual({
      tiers: { [group.sId]: "powerful" },
    });

    const clearResponse = await honoApp.request(
      groupModelTierUrl(workspace.sId, group.sId),
      { method: "DELETE" }
    );
    expect(clearResponse.status).toBe(200);
    expect(await clearResponse.json()).toEqual({ cleared: true });
  });

  it("returns 404 when the group does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await honoApp.request(
      groupModelTierUrl(workspace.sId, "invalid-group-id"),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "powerful" }),
      }
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });
});
