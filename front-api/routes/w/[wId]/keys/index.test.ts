import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { redactString } from "@app/types/shared/utils/string_utils";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/keys — secret visibility", () => {
  it("returns the full secret to the admin who created the key", async () => {
    const { workspace, user, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const key = await KeyResource.makeNew(
      {
        name: "creator-key",
        workspaceId: workspace.id,
        userId: user.id,
        isSystem: false,
        status: "active",
        role: "builder",
      },
      [globalGroup]
    );

    const res = await honoApp.request(`/api/w/${workspace.sId}/keys`);
    expect(res.status).toBe(200);

    const { keys } = await res.json();
    const returned = keys.find(
      (k: { name: string }) => k.name === "creator-key"
    );
    expect(returned.secret).toBe(key.secret);
  });

  it("redacts the secret for an admin who did not create the key", async () => {
    // First admin creates the key.
    const { workspace, user, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const key = await KeyResource.makeNew(
      {
        name: "other-admin-key",
        workspaceId: workspace.id,
        userId: user.id,
        isSystem: false,
        status: "active",
        role: "builder",
      },
      [globalGroup]
    );

    // A different admin in the same workspace lists the keys.
    await createPrivateApiMockRequest({ role: "admin", workspace });

    const res = await honoApp.request(`/api/w/${workspace.sId}/keys`);
    expect(res.status).toBe(200);

    const { keys } = await res.json();
    const returned = keys.find(
      (k: { name: string }) => k.name === "other-admin-key"
    );
    expect(returned.secret).toBe(redactString(key.secret, 4));
    expect(returned.secret).not.toBe(key.secret);
  });
});

describe("POST /api/w/:wId/keys — role restrictions", () => {
  it("rejects role: 'builder' — builder keys can no longer be created", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await honoApp.request(`/api/w/${workspace.sId}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "builder-key", role: "builder" }),
    });
    expect(res.status).toBe(400);
  });

  it("does not add a user-role key to the Builders group", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await honoApp.request(`/api/w/${workspace.sId}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "user-key", role: "user" }),
    });
    expect(res.status).toBe(201);

    const { key } = await res.json();
    const group = await GroupResource.fetchManualBuildersGroup(workspace);
    expect(group).toBeNull();
    expect(key.groupIds).not.toContain(group?.id);
  });

  it("defaults to user role and does not add the Builders group", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await honoApp.request(`/api/w/${workspace.sId}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "default-role-key" }),
    });
    expect(res.status).toBe(201);

    const { key } = await res.json();
    expect(key.role).toBe("user");
    const group = await GroupResource.fetchManualBuildersGroup(workspace);
    expect(group).toBeNull();
  });
});

describe("POST /api/w/:wId/keys — group scoping", () => {
  it("rejects scoping to a group not tied to a regular restricted space", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    // This group is not associated to any regular restricted space, so it is
    // not scopable — even for an admin.
    const group = await GroupFactory.regularManual(workspace, "Backend");

    const res = await honoApp.request(`/api/w/${workspace.sId}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "scoped-key", group_ids: [group.sId] }),
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error.type).toBe("workspace_auth_error");
  });
});
