import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DUST_DEVELOPERS_SECRETS_SECRET ??= "test-developer-secret";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();

  return {
    ...actual,
    emitAuditLogEvent: mockEmitAuditLogEvent,
  };
});

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  const { workspace, auth, user, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  await FeatureFlagFactory.basic(auth, "frames_v2");

  const pod = await SpaceFactory.project(workspace, user.id);

  return { workspace, auth, user, pod, ...rest };
}

function patchEnvVar(wId: string, spaceId: string, id: string, body: unknown) {
  return honoApp.request(
    `/api/w/${wId}/spaces/${spaceId}/sandbox/env-vars/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function deleteEnvVar(wId: string, spaceId: string, id: string) {
  return honoApp.request(
    `/api/w/${wId}/spaces/${spaceId}/sandbox/env-vars/${id}`,
    {
      method: "DELETE",
    }
  );
}

describe("PATCH/DELETE /api/w/:wId/spaces/:spaceId/sandbox/env-vars/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Guard that the admin gate still covers the nested /:id routes for a Pod
  // member (can read the Pod, not a workspace admin) after the gate moved to
  // the env-vars leaf.
  it("rejects a non-admin DELETE", async () => {
    const { workspace, pod } = await setupTest({ role: "user" });

    const response = await deleteEnvVar(
      workspace.sId,
      pod.sId,
      "env_var_unknown"
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("rejects a non-admin PATCH", async () => {
    const { workspace, pod } = await setupTest({ role: "user" });

    const response = await patchEnvVar(
      workspace.sId,
      pod.sId,
      "env_var_unknown",
      {
        allowedDomains: ["api.github.com"],
      }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("returns 404 for a missing sandbox environment variable", async () => {
    const { workspace, auth, pod } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }
    const staleEnvVarId = upsert.value.resource.sId;
    await upsert.value.resource.delete(auth);

    const response = await deleteEnvVar(workspace.sId, pod.sId, staleEnvVarId);

    expect(response.status).toBe(404);
  });

  it("returns 404 for a non-project space", async () => {
    const { workspace, auth, pod } = await setupTest();
    const regularSpace = await SpaceFactory.regular(workspace);

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await deleteEnvVar(
      workspace.sId,
      regularSpace.sId,
      upsert.value.resource.sId
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "space_not_found" },
    });
  });

  it("returns 404 when targeting a workspace-scoped env var through the pod route", async () => {
    const { workspace, auth, pod } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await deleteEnvVar(
      workspace.sId,
      pod.sId,
      upsert.value.resource.sId
    );

    expect(response.status).toBe(404);
    // The workspace-scoped row must still exist.
    expect(
      await SandboxEnvVarResource.fetchByName(
        auth,
        { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
        "API_TOKEN"
      )
    ).not.toBeNull();
  });

  it("returns 404 when targeting another pod's env var", async () => {
    const { workspace, auth, user, pod } = await setupTest();
    const otherPod = await SpaceFactory.project(workspace, user.id);

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod: otherPod },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const deleteResponse = await deleteEnvVar(
      workspace.sId,
      pod.sId,
      upsert.value.resource.sId
    );
    expect(deleteResponse.status).toBe(404);

    const patchResponse = await patchEnvVar(
      workspace.sId,
      pod.sId,
      upsert.value.resource.sId,
      { allowedDomains: ["api.example.com"] }
    );
    expect(patchResponse.status).toBe(404);

    // The other pod's row must still exist.
    expect(
      await SandboxEnvVarResource.fetchByName(
        auth,
        { kind: "pod", pod: otherPod },
        "API_TOKEN"
      )
    ).not.toBeNull();
  });

  it("deletes an existing sandbox environment variable", async () => {
    const { workspace, auth, pod } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await deleteEnvVar(
      workspace.sId,
      pod.sId,
      upsert.value.resource.sId
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(
      await SandboxEnvVarResource.fetchByName(
        auth,
        { kind: "pod", pod },
        "API_TOKEN"
      )
    ).toBeNull();
  });

  it("rejects an empty PATCH body", async () => {
    const { workspace, auth, pod } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await patchEnvVar(
      workspace.sId,
      pod.sId,
      upsert.value.resource.sId,
      {}
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("promotes a config env var to an HTTPS secret", async () => {
    const { workspace, auth, pod } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await patchEnvVar(
      workspace.sId,
      pod.sId,
      upsert.value.resource.sId,
      { kind: "https_secret", allowedDomains: ["api.example.com"] }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      envVar: { kind: "https_secret", allowedDomains: ["api.example.com"] },
    });
  });

  it("updates allowed domains on an HTTPS secret", async () => {
    const { workspace, auth, pod } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
        kind: "https_secret",
        allowedDomains: ["api.example.com"],
      }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await patchEnvVar(
      workspace.sId,
      pod.sId,
      upsert.value.resource.sId,
      { allowedDomains: ["api.example.com", "api.github.com"] }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      envVar: { allowedDomains: ["api.example.com", "api.github.com"] },
    });
  });
});
