import { KeyResource } from "@app/lib/resources/key_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { KeyType } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";
import { redactString } from "@app/types/shared/utils/string_utils";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

// A key's groups are not part of its serialized form (only the spaces they map to are), so the
// scoping a key was created with is asserted against the DB.
async function keyGroupModelIds(
  workspace: LightWorkspaceType,
  keyModelId: ModelId
) {
  const key = await KeyResource.fetchByWorkspaceAndId({
    workspace,
    id: keyModelId,
  });
  expect(key).not.toBeNull();

  return key?.groupIds.toSorted();
}

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
        role: "user",
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
        role: "user",
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
});

describe("POST /api/w/:wId/keys — space scoping", () => {
  function createKey(workspace: { sId: string }, body: object) {
    return honoApp.request(`/api/w/${workspace.sId}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("scopes the key to the groups of a restricted space", async () => {
    const { workspace, auth, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const space = await SpaceFactory.regular(workspace);
    const spaceGroups = await SpaceResource.listRegularAutoGroupsForSpaces(
      auth,
      [space]
    );
    expect(spaceGroups).toHaveLength(1);

    const res = await createKey(workspace, {
      name: "scoped-key",
      space_ids: [space.sId],
    });

    expect(res.status).toBe(201);
    const { key } = await res.json();
    expect(await keyGroupModelIds(workspace, key.id)).toEqual(
      [globalGroup.id, spaceGroups[0].id].toSorted()
    );
  });

  it("attaches only the member group of a restricted pod to a user key", async () => {
    const { workspace, auth, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const pod = await SpaceFactory.project(workspace, undefined, {
      name: "SecretPod",
    });
    const podGroups = await SpaceResource.listRegularAutoGroupsForSpaces(auth, [
      pod,
    ]);
    expect(podGroups).toHaveLength(2);
    const memberGroup = await pod.fetchManualMemberGroup(auth);

    const res = await createKey(workspace, {
      name: "pod-scoped-user-key",
      space_ids: [pod.sId],
      role: "user",
    });

    expect(res.status).toBe(201);
    const { key } = await res.json();
    // The editor group holds the space `admin` grant, which would let the key administrate the pod.
    expect(await keyGroupModelIds(workspace, key.id)).toEqual(
      [globalGroup.id, memberGroup.id].toSorted()
    );
  });

  it("attaches both the member and the editor group of a restricted pod to an admin key", async () => {
    const { workspace, auth, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const pod = await SpaceFactory.project(workspace, undefined, {
      name: "SecretPod",
    });
    const podGroups = await SpaceResource.listRegularAutoGroupsForSpaces(auth, [
      pod,
    ]);
    expect(podGroups).toHaveLength(2);

    const res = await createKey(workspace, {
      name: "pod-scoped-admin-key",
      space_ids: [pod.sId],
      role: "admin",
    });

    expect(res.status).toBe(201);
    const { key } = await res.json();
    expect(await keyGroupModelIds(workspace, key.id)).toEqual(
      [globalGroup.id, ...podGroups.map((group) => group.id)].toSorted()
    );
  });

  it("returns the scoped space when the key is created and when it is listed", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const space = await SpaceFactory.regular(workspace);

    const res = await createKey(workspace, {
      name: "space-echo-key",
      space_ids: [space.sId],
    });
    expect(res.status).toBe(201);

    const { key } = await res.json();
    expect(key.spaces.map((s: SpaceType) => s.sId)).toEqual([space.sId]);

    const listRes = await honoApp.request(`/api/w/${workspace.sId}/keys`);
    expect(listRes.status).toBe(200);

    const { keys } = await listRes.json();
    const listed = keys.find((k: KeyType) => k.name === "space-echo-key");
    expect(listed.spaces.map((s: SpaceType) => s.sId)).toEqual([space.sId]);
  });

  it("returns a scoped pod once even though the key holds both of its groups", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const pod = await SpaceFactory.project(workspace);

    // An admin key carries the pod's member *and* editor group, each with its own grant on the pod.
    const res = await createKey(workspace, {
      name: "pod-echo-key",
      space_ids: [pod.sId],
      role: "admin",
    });
    expect(res.status).toBe(201);

    const { key } = await res.json();
    expect(key.spaces.map((s: SpaceType) => s.sId)).toEqual([pod.sId]);
  });

  it("rejects scoping to an open space", async () => {
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    // Attaching the workspace global group as a viewer is what makes a space open.
    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup, "project_viewer");

    const res = await createKey(workspace, {
      name: "open-space-key",
      space_ids: [openSpace.sId],
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error.type).toBe("workspace_auth_error");
  });

  it("rejects scoping to the global or the system space", async () => {
    const { workspace, globalSpace, systemSpace } =
      await createPrivateApiMockRequest({ role: "admin" });

    for (const [index, space] of [globalSpace, systemSpace].entries()) {
      const res = await createKey(workspace, {
        name: `unique-kind-key-${index}`,
        space_ids: [space.sId],
      });

      expect(res.status).toBe(403);
      expect((await res.json()).error.type).toBe("workspace_auth_error");
    }
  });

  it("rejects an unknown space id", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const space = await SpaceFactory.regular(workspace);

    // `fetchByIds` silently drops ids it cannot resolve, so an unknown id must not pass
    // unnoticed alongside a valid one.
    const res = await createKey(workspace, {
      name: "unknown-space-key",
      space_ids: [space.sId, "notaspaceid"],
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error.type).toBe("workspace_auth_error");
  });
});
