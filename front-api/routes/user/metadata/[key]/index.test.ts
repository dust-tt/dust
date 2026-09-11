import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const KEY = "test_metadata_key";

function getMetadata(key: string, workspaceId?: string) {
  const query = workspaceId
    ? `?workspaceId=${encodeURIComponent(workspaceId)}`
    : "";
  return honoApp.request(`/api/user/metadata/${key}${query}`);
}

function postMetadata(key: string, value: string, workspaceId?: string) {
  const query = workspaceId
    ? `?workspaceId=${encodeURIComponent(workspaceId)}`
    : "";
  return honoApp.request(`/api/user/metadata/${key}${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

describe("GET /api/user/metadata/:key", () => {
  it("returns null when the key is not set", async () => {
    await createPrivateApiMockRequest();

    const response = await getMetadata(KEY);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ metadata: null });
  });

  it("returns the value set by the same user", async () => {
    const { user } = await createPrivateApiMockRequest();
    await user.setMetadata(KEY, "hello");

    const response = await getMetadata(KEY);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      metadata: { key: KEY, value: "hello" },
    });
  });

  it("scopes reads to the workspace when workspaceId is provided", async () => {
    const { user, workspace } = await createPrivateApiMockRequest();
    await user.setMetadata(KEY, "user-scoped");
    await user.setMetadata(KEY, "workspace-scoped", workspace.id);

    const userScoped = await getMetadata(KEY);
    expect(await userScoped.json()).toEqual({
      metadata: { key: KEY, value: "user-scoped" },
    });

    const workspaceScoped = await getMetadata(KEY, workspace.sId);
    expect(await workspaceScoped.json()).toEqual({
      metadata: { key: KEY, value: "workspace-scoped" },
    });
  });

  it("falls back to user scope for a workspace the user is not a member of", async () => {
    const { user } = await createPrivateApiMockRequest();
    const otherWorkspace = await WorkspaceFactory.basic();
    await user.setMetadata(KEY, "user-scoped");
    await user.setMetadata(KEY, "other-workspace", otherWorkspace.id);

    const response = await getMetadata(KEY, otherWorkspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      metadata: { key: KEY, value: "user-scoped" },
    });
  });
});

describe("POST /api/user/metadata/:key", () => {
  it("creates then updates a user-scoped value", async () => {
    const { user } = await createPrivateApiMockRequest();

    const created = await postMetadata(KEY, "first");
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual({
      metadata: { key: KEY, value: "first" },
    });
    expect((await user.getMetadata(KEY))?.value).toBe("first");

    const updated = await postMetadata(KEY, "second");
    expect(updated.status).toBe(200);
    expect((await user.getMetadata(KEY))?.value).toBe("second");
  });

  it("writes a workspace-scoped value when the user is a member", async () => {
    const { user, workspace } = await createPrivateApiMockRequest();

    const response = await postMetadata(KEY, "scoped", workspace.sId);

    expect(response.status).toBe(200);
    expect((await user.getMetadata(KEY, workspace.id))?.value).toBe("scoped");
    expect(await user.getMetadata(KEY)).toBeNull();
  });

  it("falls back to user scope for a workspace the user is not a member of", async () => {
    const { user } = await createPrivateApiMockRequest();
    const otherWorkspace = await WorkspaceFactory.basic();

    const response = await postMetadata(KEY, "scoped", otherWorkspace.sId);

    expect(response.status).toBe(200);
    expect(await user.getMetadata(KEY, otherWorkspace.id)).toBeNull();
    expect((await user.getMetadata(KEY))?.value).toBe("scoped");
  });
});
