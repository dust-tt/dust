import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { PostSandboxEnvVarsBulkResponseBody } from "@app/types/api/sandbox/env_vars";
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
  disableComputerFeature = false,
}: {
  role?: MembershipRoleType;
  disableComputerFeature?: boolean;
} = {}) {
  const { workspace, auth, user, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (disableComputerFeature) {
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");
  }

  const podA = await SpaceFactory.project(workspace, user.id);
  const podB = await SpaceFactory.project(workspace, user.id);

  return { workspace, auth, user, podA, podB, ...rest };
}

function getBulk(wId: string, query: string) {
  return honoApp.request(`/api/w/${wId}/sandbox/env-vars/bulk?${query}`);
}

function postBulk(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/sandbox/env-vars/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/w/:wId/sandbox/env-vars/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace, podA } = await setupTest({ role: "user" });

    const response = await getBulk(workspace.sId, `podIds=${podA.sId}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("returns 403 when Computer is disabled", async () => {
    const { workspace, podA } = await setupTest({
      disableComputerFeature: true,
    });

    const response = await getBulk(workspace.sId, `podIds=${podA.sId}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });

  it("returns the selected pods' env vars flat, without workspace rows", async () => {
    const { workspace, auth, podA, podB } = await setupTest();

    for (const [scope, name] of [
      [
        {
          kind: "workspace" as const,
          workspace: auth.getNonNullableWorkspace(),
        },
        "WORKSPACE_TOKEN",
      ],
      [{ kind: "pod" as const, pod: podA }, "A_TOKEN"],
      [{ kind: "pod" as const, pod: podB }, "B_TOKEN"],
    ] as const) {
      const upsert = await SandboxEnvVarResource.upsert(auth, scope, {
        name,
        value: "value",
      });
      if (upsert.isErr()) {
        throw upsert.error;
      }
    }

    const response = await getBulk(
      workspace.sId,
      `podIds=${podA.sId},${podB.sId}`
    );

    expect(response.status).toBe(200);
    // toMatchObject on an array also pins its length; ordered by name.
    expect(await response.json()).toMatchObject({
      envVars: [
        { name: "DST_A_TOKEN", spaceId: podA.sId },
        { name: "DST_B_TOKEN", spaceId: podB.sId },
      ],
    });
  });

  it("supports repeated podIds params and drops unknown ids", async () => {
    const { workspace, auth, podA } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod: podA },
      { name: "A_TOKEN", value: "value" }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await getBulk(
      workspace.sId,
      `podIds=${podA.sId}&podIds=spc_unknown`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      envVars: [{ name: "DST_A_TOKEN", spaceId: podA.sId }],
    });
  });

  it("resolves scope=all-pods to every live pod, excluding archived ones", async () => {
    const { workspace, auth, podA, podB } = await setupTest();
    await ProjectMetadataResource.makeNew(auth, podA, { description: null });
    await ProjectMetadataResource.makeNew(auth, podB, { description: null });
    const archivedPod = await SpaceFactory.project(workspace);
    const archivedMetadata = await ProjectMetadataResource.makeNew(
      auth,
      archivedPod,
      { description: null }
    );
    await archivedMetadata.archive();

    for (const [pod, name] of [
      [podA, "A_TOKEN"],
      [archivedPod, "ARCHIVED_TOKEN"],
    ] as const) {
      const upsert = await SandboxEnvVarResource.upsert(
        auth,
        { kind: "pod", pod },
        { name, value: "value" }
      );
      if (upsert.isErr()) {
        throw upsert.error;
      }
    }

    const response = await getBulk(workspace.sId, "scope=all-pods");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      envVars: [{ name: "DST_A_TOKEN", spaceId: podA.sId }],
    });
  });

  it("rejects providing both scope and podIds, or neither", async () => {
    const { workspace, podA } = await setupTest();

    const bothResponse = await getBulk(
      workspace.sId,
      `scope=all-pods&podIds=${podA.sId}`
    );
    expect(bothResponse.status).toBe(400);

    const neitherResponse = await getBulk(workspace.sId, "");
    expect(neitherResponse.status).toBe(400);
  });
});

describe("POST /api/w/:wId/sandbox/env-vars/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates one independently scoped row per pod", async () => {
    const { workspace, auth, podA, podB } = await setupTest();

    const response = await postBulk(workspace.sId, {
      name: "DST_API_TOKEN",
      value: "super-secret-token",
      podIds: [podA.sId, podB.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        { podId: podA.sId, success: true, created: true },
        { podId: podB.sId, success: true, created: true },
      ],
    });

    for (const pod of [podA, podB]) {
      const podVars = await SandboxEnvVarResource.listForScope(auth, {
        kind: "pod",
        pod,
      });
      expect(podVars.map((envVar) => envVar.envName)).toEqual([
        "DST_API_TOKEN",
      ]);
    }

    // The pod-scoped rows must not leak into the workspace scope.
    const workspaceVars = await SandboxEnvVarResource.listForScope(auth, {
      kind: "workspace",
      workspace: auth.getNonNullableWorkspace(),
    });
    expect(workspaceVars).toHaveLength(0);

    // One audit event per pod row, each identifying its pod.
    for (const pod of [podA, podB]) {
      expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "sandbox_env_var.created",
          metadata: expect.objectContaining({ space_id: pod.sId }),
        })
      );
    }
  });

  it("reports per-pod failures for unknown or non-project pods and still applies the rest", async () => {
    const { workspace, auth, podA } = await setupTest();
    const regularSpace = await SpaceFactory.regular(workspace);

    const response = await postBulk(workspace.sId, {
      name: "DST_API_TOKEN",
      value: "super-secret-token",
      podIds: [podA.sId, "spc_unknown", regularSpace.sId],
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as PostSandboxEnvVarsBulkResponseBody;
    expect(data.results).toEqual([
      { podId: podA.sId, success: true, created: true },
      {
        podId: "spc_unknown",
        success: false,
        errorMessage: "Pod not found.",
      },
      {
        podId: regularSpace.sId,
        success: false,
        errorMessage: "Pod not found.",
      },
    ]);

    const podVars = await SandboxEnvVarResource.listForScope(auth, {
      kind: "pod",
      pod: podA,
    });
    expect(podVars).toHaveLength(1);
  });

  it("validates the payload once and writes nothing on an invalid name", async () => {
    const { workspace, auth, podA } = await setupTest();

    const response = await postBulk(workspace.sId, {
      name: "bad-name",
      value: "value",
      podIds: [podA.sId],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });

    const podVars = await SandboxEnvVarResource.listForScope(auth, {
      kind: "pod",
      pod: podA,
    });
    expect(podVars).toHaveLength(0);
  });

  it("returns created:false when replacing an existing pod row", async () => {
    const { workspace, auth, podA, podB } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod: podA },
      { name: "API_TOKEN", value: "initial-value" }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await postBulk(workspace.sId, {
      name: "DST_API_TOKEN",
      value: "rotated-value",
      podIds: [podA.sId, podB.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        { podId: podA.sId, success: true, created: false },
        { podId: podB.sId, success: true, created: true },
      ],
    });
  });

  it("creates https_secret rows with normalized allowed domains", async () => {
    const { workspace, auth, podA } = await setupTest();

    const response = await postBulk(workspace.sId, {
      name: "DSEC_API_TOKEN",
      value: "super-secret-token",
      kind: "https_secret",
      allowedDomains: ["API.GitHub.COM"],
      podIds: [podA.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ podId: podA.sId, success: true, created: true }],
    });

    const podVars = await SandboxEnvVarResource.listForScope(auth, {
      kind: "pod",
      pod: podA,
    });
    expect(podVars).toHaveLength(1);
    expect(podVars[0].kind).toBe("https_secret");
    expect(podVars[0].allowedDomains).toEqual(["api.github.com"]);
  });

  it("rejects invalid allowed domains before any write", async () => {
    const { workspace, auth, podA } = await setupTest();

    const response = await postBulk(workspace.sId, {
      name: "DSEC_API_TOKEN",
      value: "super-secret-token",
      kind: "https_secret",
      allowedDomains: ["127.0.0.1"],
      podIds: [podA.sId],
    });

    expect(response.status).toBe(400);
    const podVars = await SandboxEnvVarResource.listForScope(auth, {
      kind: "pod",
      pod: podA,
    });
    expect(podVars).toHaveLength(0);
  });

  it("rejects an empty podIds array", async () => {
    const { workspace } = await setupTest();

    const response = await postBulk(workspace.sId, {
      name: "DST_API_TOKEN",
      value: "value",
      podIds: [],
    });

    expect(response.status).toBe(400);
  });
});
