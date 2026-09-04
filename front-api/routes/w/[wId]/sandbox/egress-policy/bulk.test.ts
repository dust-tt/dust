import {
  writeOwnerPolicy,
  writeWorkspacePolicy,
} from "@app/lib/api/sandbox/egress_policy";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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

const BulkPoliciesResponseSchema = z.object({
  policies: z.array(
    z.object({
      podId: z.string(),
      policy: z.object({ allowedDomains: z.array(z.string()) }),
    })
  ),
});

const BulkWriteResponseSchema = z.object({
  results: z.array(
    z.object({
      scopeId: z.string(),
      success: z.boolean(),
      errorMessage: z.string().optional(),
    })
  ),
});

async function setupTest({
  role = "admin",
  enableSandboxFunctions = true,
}: {
  role?: MembershipRoleType;
  enableSandboxFunctions?: boolean;
} = {}) {
  const { workspace, auth, user, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (enableSandboxFunctions) {
    await FeatureFlagFactory.basic(auth, "frames_v2");
  }

  const podA = await SpaceFactory.project(workspace, user.id);
  const podB = await SpaceFactory.project(workspace, user.id);
  await ProjectMetadataResource.makeNew(auth, podA, { description: null });
  await ProjectMetadataResource.makeNew(auth, podB, { description: null });

  return { workspace, auth, user, podA, podB, ...rest };
}

function getBulk(wId: string, query: string) {
  return honoApp.request(`/api/w/${wId}/sandbox/egress-policy/bulk?${query}`);
}

function postBulk(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/sandbox/egress-policy/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function workspacePolicyPath(wId: string) {
  return `w/${wId}/sandbox-egress-policy.json`;
}

function podPolicyPath(wId: string, podId: string) {
  return `w/${wId}/sandboxes/${podId}.json`;
}

function allowedDomainsAt(path: string): string[] {
  const stored = fileStorageMock.getObject(path);
  if (stored === undefined) {
    return [];
  }
  return JSON.parse(stored).allowedDomains ?? [];
}

function requestedDomainsAt(
  path: string
): { domain: string; requestedAtMs: number }[] {
  const stored = fileStorageMock.getObject(path);
  if (stored === undefined) {
    return [];
  }
  return JSON.parse(stored).requestedDomains ?? [];
}

// The GCS mock's prefix listing is override-driven; point the sandboxes/vlt_
// prefix at the given Pods so they read back as "configured".
function markConfigured(wId: string, pods: SpaceResource[]) {
  const prefix = `w/${wId}/sandboxes/vlt_`;
  fileStorageMock.setFilesByPrefix((requested) =>
    requested === prefix
      ? pods.map((pod) => ({
          name: `w/${wId}/sandboxes/${pod.sId}.json`,
          metadata: {},
        }))
      : null
  );
}

async function configurePod(
  auth: Authenticator,
  pod: SpaceResource,
  allowedDomains: string[]
) {
  const write = await writeOwnerPolicy(auth, {
    ownerId: pod.sId,
    policy: { allowedDomains },
  });
  if (write.isErr()) {
    throw write.error;
  }
}

describe("GET /api/w/:wId/sandbox/egress-policy/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The GCS global mock is reset before each test; enable real not-found
    // semantics so reads round-trip through the in-memory object store.
    fileStorageMock.setFetchFileContentNotFound(() => true);
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace, podA } = await setupTest({ role: "user" });

    const response = await getBulk(workspace.sId, `podIds=${podA.sId}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("returns 403 when frames_v2 is disabled", async () => {
    const { workspace, podA } = await setupTest({
      enableSandboxFunctions: false,
    });

    const response = await getBulk(workspace.sId, `podIds=${podA.sId}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });

  it("returns only the requested Pods that have their own policy", async () => {
    const { workspace, auth, podA, podB } = await setupTest();
    await configurePod(auth, podA, ["api.github.com"]);
    // podB is a live Pod but has no policy, so it is not configured.
    markConfigured(workspace.sId, [podA]);

    const response = await getBulk(
      workspace.sId,
      `podIds=${podA.sId},${podB.sId}`
    );

    expect(response.status).toBe(200);
    const { policies } = BulkPoliciesResponseSchema.parse(
      await response.json()
    );
    expect(policies).toEqual([
      { podId: podA.sId, policy: { allowedDomains: ["api.github.com"] } },
    ]);
  });

  it("resolves scope=all-pods to every configured Pod", async () => {
    const { workspace, auth, podA, podB } = await setupTest();
    await configurePod(auth, podA, ["api.github.com"]);
    await configurePod(auth, podB, ["example.com"]);
    markConfigured(workspace.sId, [podA, podB]);

    const response = await getBulk(workspace.sId, "scope=all-pods");

    expect(response.status).toBe(200);
    const { policies } = BulkPoliciesResponseSchema.parse(
      await response.json()
    );
    expect(policies.map((p) => p.podId).sort()).toEqual(
      [podA.sId, podB.sId].sort()
    );
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

  it("returns a 500 when the Pod policy listing fails", async () => {
    const { workspace, podA } = await setupTest();
    fileStorageMock.setFilesByPrefix(() => {
      throw new Error("gcs unavailable");
    });

    const response = await getBulk(workspace.sId, `podIds=${podA.sId}`);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});

describe("POST /api/w/:wId/sandbox/egress-policy/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.setFetchFileContentNotFound(() => true);
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace, podA } = await setupTest({ role: "user" });

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [podA.sId],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("returns 403 when frames_v2 is disabled", async () => {
    const { workspace, podA } = await setupTest({
      enableSandboxFunctions: false,
    });

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [podA.sId],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });

  it("returns 400 for an empty domain", async () => {
    const { workspace, podA } = await setupTest();

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [podA.sId],
      operation: { operation: "add", domain: "" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("returns 400 when no scope is selected", async () => {
    const { workspace } = await setupTest();

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("collapses a workspace add to the workspace alone, skipping selected pods", async () => {
    const { workspace, podA, podB } = await setupTest();

    const response = await postBulk(workspace.sId, {
      includeWorkspace: true,
      podIds: [podA.sId, podB.sId],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    const { results } = BulkWriteResponseSchema.parse(await response.json());
    // The workspace add already covers every Pod, so the selected pods are
    // skipped and only the workspace is written.
    expect(results).toEqual([{ scopeId: "workspace", success: true }]);

    expect(allowedDomainsAt(workspacePolicyPath(workspace.sId))).toEqual([
      "api.github.com",
    ]);
    // The selected pod policies are left untouched.
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podA.sId))).toEqual(
      []
    );
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podB.sId))).toEqual(
      []
    );

    // Only the workspace audit event fires (no space_id, no per-pod events).
    expect(mockEmitAuditLogEvent).toHaveBeenCalledTimes(1);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_egress_policy.updated",
        metadata: expect.not.objectContaining({ space_id: expect.anything() }),
      })
    );
  });

  it("adds a domain to only the selected pods when the workspace is not included", async () => {
    const { workspace, podA, podB } = await setupTest();

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [podA.sId, podB.sId],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    const { results } = BulkWriteResponseSchema.parse(await response.json());
    expect(results).toEqual([
      { scopeId: podA.sId, success: true },
      { scopeId: podB.sId, success: true },
    ]);

    // The workspace policy is untouched; both pods carry the new domain.
    expect(allowedDomainsAt(workspacePolicyPath(workspace.sId))).toEqual([]);
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podA.sId))).toEqual([
      "api.github.com",
    ]);
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podB.sId))).toEqual([
      "api.github.com",
    ]);
  });

  it("removes a domain from the workspace and every selected pod", async () => {
    const { workspace, auth, podA, podB } = await setupTest();

    const seedWorkspace = await writeWorkspacePolicy(auth, {
      policy: { allowedDomains: ["api.github.com", "example.com"] },
    });
    if (seedWorkspace.isErr()) {
      throw seedWorkspace.error;
    }
    for (const pod of [podA, podB]) {
      const seed = await writeOwnerPolicy(auth, {
        ownerId: pod.sId,
        policy: { allowedDomains: ["api.github.com", "example.com"] },
      });
      if (seed.isErr()) {
        throw seed.error;
      }
    }

    const response = await postBulk(workspace.sId, {
      includeWorkspace: true,
      podIds: [podA.sId, podB.sId],
      operation: { operation: "remove", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    const { results } = BulkWriteResponseSchema.parse(await response.json());
    expect(results).toEqual([
      { scopeId: "workspace", success: true },
      { scopeId: podA.sId, success: true },
      { scopeId: podB.sId, success: true },
    ]);

    expect(allowedDomainsAt(workspacePolicyPath(workspace.sId))).toEqual([
      "example.com",
    ]);
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podA.sId))).toEqual([
      "example.com",
    ]);
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podB.sId))).toEqual([
      "example.com",
    ]);
  });

  it("reports per-scope failures for unknown pods and still applies the rest", async () => {
    const { workspace, podA } = await setupTest();

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [podA.sId, "vlt_unknown"],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    const { results } = BulkWriteResponseSchema.parse(await response.json());
    expect(results).toEqual([
      { scopeId: podA.sId, success: true },
      {
        scopeId: "vlt_unknown",
        success: false,
        errorMessage: "Pod not found.",
      },
    ]);

    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podA.sId))).toEqual([
      "api.github.com",
    ]);
  });

  it("leaves the workspace policy untouched when includeWorkspace is false", async () => {
    const { workspace, podA } = await setupTest();

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [podA.sId],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ scopeId: podA.sId, success: true }],
    });
    // The workspace file is never written, so it stays absent.
    expect(allowedDomainsAt(workspacePolicyPath(workspace.sId))).toEqual([]);
  });

  it("is a no-op when adding a domain already present, skipping the audit", async () => {
    const { workspace, auth, podA } = await setupTest();

    const seed = await writeOwnerPolicy(auth, {
      ownerId: podA.sId,
      policy: { allowedDomains: ["api.github.com"] },
    });
    if (seed.isErr()) {
      throw seed.error;
    }

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [podA.sId],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ scopeId: podA.sId, success: true }],
    });
    // Still a single entry, and no audit event for an unchanged policy.
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podA.sId))).toEqual([
      "api.github.com",
    ]);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("is a no-op when removing a domain that is absent", async () => {
    const { workspace, podA } = await setupTest();

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [podA.sId],
      operation: { operation: "remove", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ scopeId: podA.sId, success: true }],
    });
    // A no-op remove must not create the Pod policy file — otherwise the Pod
    // would show up as "configured" to the file-existence-based listing.
    expect(
      fileStorageMock.getObject(podPolicyPath(workspace.sId, podA.sId))
    ).toBe(undefined);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("preserves a Pod's pending requests when a domain is added", async () => {
    const { workspace, auth, podA } = await setupTest();

    const seed = await writeOwnerPolicy(auth, {
      ownerId: podA.sId,
      policy: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
      },
    });
    if (seed.isErr()) {
      throw seed.error;
    }

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [podA.sId],
      operation: { operation: "add", domain: "example.com" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ scopeId: podA.sId, success: true }],
    });
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podA.sId))).toEqual([
      "api.github.com",
      "example.com",
    ]);
    // The unrelated pending request must survive the admin add.
    expect(requestedDomainsAt(podPolicyPath(workspace.sId, podA.sId))).toEqual([
      { domain: "api.stripe.com", requestedAtMs: 1 },
    ]);
  });

  it("rejects writes to an archived Pod and leaves it untouched", async () => {
    const { workspace, auth } = await setupTest();
    const archivedPod = await SpaceFactory.project(workspace);
    const metadata = await ProjectMetadataResource.makeNew(auth, archivedPod, {
      description: null,
    });
    await metadata.archive();

    const response = await postBulk(workspace.sId, {
      includeWorkspace: false,
      podIds: [archivedPod.sId],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          scopeId: archivedPod.sId,
          success: false,
          errorMessage: "Pod not found.",
        },
      ],
    });
    // The archived Pod's policy file is never created.
    expect(
      fileStorageMock.getObject(podPolicyPath(workspace.sId, archivedPod.sId))
    ).toBe(undefined);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });
});
