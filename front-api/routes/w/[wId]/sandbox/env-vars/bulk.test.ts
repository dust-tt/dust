import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Parsed in assertions to keep the results strongly typed without an `as` cast.
const PostBulkResultsSchema = z.object({
  results: z.array(
    z.object({
      podId: z.string(),
      success: z.boolean(),
      created: z.boolean().optional(),
      errorMessage: z.string().optional(),
    })
  ),
});
const DeleteBulkResultsSchema = z.object({
  results: z.array(
    z.object({
      scopeId: z.string(),
      success: z.boolean(),
      errorMessage: z.string().optional(),
    })
  ),
});

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
  enableSandboxFunctions = true,
}: {
  role?: MembershipRoleType;
  disableComputerFeature?: boolean;
  enableSandboxFunctions?: boolean;
} = {}) {
  const { workspace, auth, user, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (enableSandboxFunctions) {
    await FeatureFlagFactory.basic(auth, "sandbox_functions");
  }
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

function deleteBulk(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/sandbox/env-vars/bulk`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedEnvVar(
  auth: Parameters<typeof SandboxEnvVarResource.upsert>[0],
  scope: Parameters<typeof SandboxEnvVarResource.upsert>[1],
  name: string
) {
  const upsert = await SandboxEnvVarResource.upsert(auth, scope, {
    name,
    value: "value",
  });
  if (upsert.isErr()) {
    throw upsert.error;
  }
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
    const { results } = PostBulkResultsSchema.parse(await response.json());
    expect(results).toEqual([
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

describe("DELETE /api/w/:wId/sandbox/env-vars/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when the sandbox_functions flag is off", async () => {
    const { workspace, podA } = await setupTest({
      enableSandboxFunctions: false,
    });

    const response = await deleteBulk(workspace.sId, {
      name: "DST_API_TOKEN",
      kind: "config",
      includeWorkspace: false,
      podIds: [podA.sId],
    });

    expect(response.status).toBe(403);
  });

  it("deletes the variable from the workspace and each pod that defines it", async () => {
    const { workspace, auth, podA, podB } = await setupTest();
    const workspaceScope = {
      kind: "workspace" as const,
      workspace: auth.getNonNullableWorkspace(),
    };
    await seedEnvVar(auth, workspaceScope, "API_TOKEN");
    await seedEnvVar(auth, { kind: "pod", pod: podA }, "API_TOKEN");
    await seedEnvVar(auth, { kind: "pod", pod: podB }, "API_TOKEN");

    const response = await deleteBulk(workspace.sId, {
      name: "DST_API_TOKEN",
      kind: "config",
      includeWorkspace: true,
      podIds: [podA.sId, podB.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        { scopeId: "workspace", success: true },
        { scopeId: podA.sId, success: true },
        { scopeId: podB.sId, success: true },
      ],
    });

    for (const scope of [
      workspaceScope,
      { kind: "pod" as const, pod: podA },
      { kind: "pod" as const, pod: podB },
    ]) {
      expect(
        await SandboxEnvVarResource.listForScope(auth, scope)
      ).toHaveLength(0);
    }

    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sandbox_env_var.deleted" })
    );
  });

  it("removes a pod override while leaving the workspace baseline intact", async () => {
    const { workspace, auth, podA } = await setupTest();
    const workspaceScope = {
      kind: "workspace" as const,
      workspace: auth.getNonNullableWorkspace(),
    };
    await seedEnvVar(auth, workspaceScope, "API_TOKEN");
    await seedEnvVar(auth, { kind: "pod", pod: podA }, "API_TOKEN");

    const response = await deleteBulk(workspace.sId, {
      name: "DST_API_TOKEN",
      kind: "config",
      includeWorkspace: false,
      podIds: [podA.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ scopeId: podA.sId, success: true }],
    });

    expect(
      await SandboxEnvVarResource.listForScope(auth, { kind: "pod", pod: podA })
    ).toHaveLength(0);
    expect(
      await SandboxEnvVarResource.listForScope(auth, workspaceScope)
    ).toHaveLength(1);
  });

  it("reports no-op success for scopes that do not define the name", async () => {
    const { workspace, podA } = await setupTest();

    const response = await deleteBulk(workspace.sId, {
      name: "DST_MISSING",
      kind: "config",
      includeWorkspace: true,
      podIds: [podA.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        { scopeId: "workspace", success: true },
        { scopeId: podA.sId, success: true },
      ],
    });
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("reports pod-not-found for unknown or non-project pods", async () => {
    const { workspace, auth, podA } = await setupTest();
    const regularSpace = await SpaceFactory.regular(workspace);
    await seedEnvVar(auth, { kind: "pod", pod: podA }, "API_TOKEN");

    const response = await deleteBulk(workspace.sId, {
      name: "DST_API_TOKEN",
      kind: "config",
      includeWorkspace: false,
      podIds: [podA.sId, "spc_unknown", regularSpace.sId],
    });

    expect(response.status).toBe(200);
    const { results } = DeleteBulkResultsSchema.parse(await response.json());
    expect(results).toEqual([
      { scopeId: podA.sId, success: true },
      {
        scopeId: "spc_unknown",
        success: false,
        errorMessage: "Pod not found.",
      },
      {
        scopeId: regularSpace.sId,
        success: false,
        errorMessage: "Pod not found.",
      },
    ]);
  });
});
