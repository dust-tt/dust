import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  withoutSandboxFunctionsFeature = false,
}: {
  role?: MembershipRoleType;
  withoutSandboxFunctionsFeature?: boolean;
} = {}) {
  const { workspace, auth, user, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (!withoutSandboxFunctionsFeature) {
    await FeatureFlagFactory.basic(auth, "frames_v2");
  }

  const pod = await SpaceFactory.project(workspace, user.id);

  return { workspace, auth, user, pod, ...rest };
}

function listEnvVars(wId: string, spaceId: string) {
  return honoApp.request(`/api/w/${wId}/spaces/${spaceId}/sandbox/env-vars`);
}

function postEnvVar(wId: string, spaceId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/spaces/${spaceId}/sandbox/env-vars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET/POST /api/w/:wId/spaces/:spaceId/sandbox/env-vars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace, pod } = await setupTest({ role: "user" });

    const response = await listEnvVars(workspace.sId, pod.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("returns 403 without the frames_v2 feature", async () => {
    const { workspace, pod } = await setupTest({
      withoutSandboxFunctionsFeature: true,
    });

    const response = await listEnvVars(workspace.sId, pod.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });

  it("returns 404 for an unknown space", async () => {
    const { workspace } = await setupTest();

    const response = await listEnvVars(workspace.sId, "spc_unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "space_not_found" },
    });
  });

  it("returns 404 for a non-project space", async () => {
    const { workspace } = await setupTest();
    const regularSpace = await SpaceFactory.regular(workspace);

    const response = await listEnvVars(workspace.sId, regularSpace.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "space_not_found" },
    });
  });

  it("returns an empty list when no env vars exist", async () => {
    const { workspace, pod } = await setupTest();

    const response = await listEnvVars(workspace.sId, pod.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ envVars: [] });
  });

  it("lists only this pod's env vars, not workspace or other pod ones", async () => {
    const { workspace, auth, user, pod } = await setupTest();
    const otherPod = await SpaceFactory.project(workspace, user.id);

    const workspaceUpsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
      { name: "WORKSPACE_TOKEN", value: "workspace-value" }
    );
    if (workspaceUpsert.isErr()) {
      throw workspaceUpsert.error;
    }
    const otherPodUpsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod: otherPod },
      { name: "OTHER_POD_TOKEN", value: "other-pod-value" }
    );
    if (otherPodUpsert.isErr()) {
      throw otherPodUpsert.error;
    }
    const podUpsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod },
      { name: "POD_TOKEN", value: "pod-value" }
    );
    if (podUpsert.isErr()) {
      throw podUpsert.error;
    }

    const response = await listEnvVars(workspace.sId, pod.sId);

    expect(response.status).toBe(200);
    // toMatchObject on an array also pins its length.
    expect(await response.json()).toMatchObject({
      envVars: [{ name: "DST_POD_TOKEN", spaceId: pod.sId }],
    });
  });

  it("creates a config env var with the DST_ prefix and returns 201", async () => {
    const { workspace, auth, pod } = await setupTest();

    const response = await postEnvVar(workspace.sId, pod.sId, {
      name: "DST_API_TOKEN",
      value: "super-secret-token",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      created: true,
      envVar: { name: "DST_API_TOKEN", kind: "config", spaceId: pod.sId },
    });

    // The pod-scoped row must not leak into the workspace scope.
    const workspaceVars = await SandboxEnvVarResource.listForScope(auth, {
      kind: "workspace",
      workspace: auth.getNonNullableWorkspace(),
    });
    expect(workspaceVars).toHaveLength(0);

    // Pod-scoped audit events identify their pod.
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_env_var.created",
        metadata: expect.objectContaining({ space_id: pod.sId }),
      })
    );
  });

  it("returns 200 when overwriting an existing env var", async () => {
    const { workspace, auth, pod } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod },
      {
        name: "API_TOKEN",
        value: "initial-value",
      }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await postEnvVar(workspace.sId, pod.sId, {
      name: "DST_API_TOKEN",
      value: "rotated-value",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: false });
  });

  it("rejects invalid POST body via zod", async () => {
    const { workspace, pod } = await setupTest();

    const response = await postEnvVar(workspace.sId, pod.sId, {
      name: "MY_VAR",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });
});
