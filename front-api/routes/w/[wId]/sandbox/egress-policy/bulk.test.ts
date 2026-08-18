import {
  writeOwnerPolicy,
  writeWorkspacePolicy,
} from "@app/lib/api/sandbox/egress_policy";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type {
  GetPodEgressPoliciesBulkResponseBody,
  PostBulkEgressPolicyResponseBody,
} from "@app/types/api/sandbox/egress_policy";
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
  enableComputerAdminPods = true,
}: {
  role?: MembershipRoleType;
  enableComputerAdminPods?: boolean;
} = {}) {
  const { workspace, auth, user, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (enableComputerAdminPods) {
    await FeatureFlagFactory.basic(auth, "computer_admin_pods");
  }

  const podA = await SpaceFactory.project(workspace, user.id);
  const podB = await SpaceFactory.project(workspace, user.id);

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

describe("GET /api/w/:wId/sandbox/egress-policy/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The GCS global mock (registered in vite.setup.ts) is reset before each
    // test; enable real not-found semantics so reads round-trip through the
    // in-memory object store and unwritten paths 404 like real GCS.
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

  it("returns each selected pod's policy, empty for pods without one", async () => {
    const { workspace, auth, podA, podB } = await setupTest();

    const write = await writeOwnerPolicy(auth, {
      ownerId: podA.sId,
      policy: { allowedDomains: ["api.github.com"] },
    });
    if (write.isErr()) {
      throw write.error;
    }

    const response = await getBulk(
      workspace.sId,
      `podIds=${podA.sId},${podB.sId}`
    );

    expect(response.status).toBe(200);
    const data =
      (await response.json()) as GetPodEgressPoliciesBulkResponseBody;
    expect(data.policies).toHaveLength(2);
    expect(data.policies).toEqual(
      expect.arrayContaining([
        { podId: podA.sId, policy: { allowedDomains: ["api.github.com"] } },
        { podId: podB.sId, policy: { allowedDomains: [] } },
      ])
    );
  });

  it("drops unknown and non-project ids from the selection", async () => {
    const { workspace, podA } = await setupTest();
    const regularSpace = await SpaceFactory.regular(workspace);

    const response = await getBulk(
      workspace.sId,
      `podIds=${podA.sId},spc_unknown,${regularSpace.sId}`
    );

    expect(response.status).toBe(200);
    const data =
      (await response.json()) as GetPodEgressPoliciesBulkResponseBody;
    expect(data.policies).toEqual([
      { podId: podA.sId, policy: { allowedDomains: [] } },
    ]);
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

    const response = await getBulk(workspace.sId, "scope=all-pods");

    expect(response.status).toBe(200);
    const data =
      (await response.json()) as GetPodEgressPoliciesBulkResponseBody;
    expect(data.policies.map(({ podId }) => podId).sort()).toEqual(
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

  it("returns 403 when computer_admin_pods is disabled", async () => {
    const { workspace, podA } = await setupTest({
      enableComputerAdminPods: false,
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

  it("adds a domain to the workspace and every selected pod", async () => {
    const { workspace, podA, podB } = await setupTest();

    const response = await postBulk(workspace.sId, {
      includeWorkspace: true,
      podIds: [podA.sId, podB.sId],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as PostBulkEgressPolicyResponseBody;
    expect(data.results).toEqual([
      { scopeId: "workspace", success: true },
      { scopeId: podA.sId, success: true },
      { scopeId: podB.sId, success: true },
    ]);

    // The GCS policy files carry the new domain.
    expect(allowedDomainsAt(workspacePolicyPath(workspace.sId))).toEqual([
      "api.github.com",
    ]);
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podA.sId))).toEqual([
      "api.github.com",
    ]);
    expect(allowedDomainsAt(podPolicyPath(workspace.sId, podB.sId))).toEqual([
      "api.github.com",
    ]);

    // One audit event per changed scope: pods carry their space_id, the
    // workspace omits it.
    for (const pod of [podA, podB]) {
      expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "sandbox_egress_policy.updated",
          metadata: expect.objectContaining({
            space_id: pod.sId,
            allowed_domains: "api.github.com",
          }),
        })
      );
    }
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_egress_policy.updated",
        metadata: expect.not.objectContaining({ space_id: expect.anything() }),
      })
    );
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
    const data = (await response.json()) as PostBulkEgressPolicyResponseBody;
    expect(data.results).toEqual([
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
      podIds: [podA.sId, "spc_unknown"],
      operation: { operation: "add", domain: "api.github.com" },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as PostBulkEgressPolicyResponseBody;
    expect(data.results).toEqual([
      { scopeId: podA.sId, success: true },
      {
        scopeId: "spc_unknown",
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
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({ space_id: expect.anything() }),
      })
    );
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
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });
});
