import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
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
  enableSandboxFunctions = true,
}: {
  role?: MembershipRoleType;
  enableSandboxFunctions?: boolean;
} = {}) {
  const { workspace, auth, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (enableSandboxFunctions) {
    await FeatureFlagFactory.basic(auth, "frames_v2");
  }

  return { workspace, auth, ...rest };
}

function getPolicy(wId: string, spaceId: string) {
  return honoApp.request(
    `/api/w/${wId}/spaces/${spaceId}/sandbox/egress-policy`
  );
}

function putPolicy(wId: string, spaceId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${wId}/spaces/${spaceId}/sandbox/egress-policy`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function dismissRequest(wId: string, spaceId: string, domain: string) {
  return honoApp.request(
    `/api/w/${wId}/spaces/${spaceId}/sandbox/egress-policy/requests/dismiss`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    }
  );
}

function requestDomain(wId: string, spaceId: string, domain: string) {
  return honoApp.request(
    `/api/w/${wId}/spaces/${spaceId}/sandbox/egress-policy/requests`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    }
  );
}

function seedPolicyFile(
  wId: string,
  spaceId: string,
  policy: {
    allowedDomains: string[];
    requestedDomains?: { domain: string; requestedAtMs: number }[];
  }
) {
  fileStorageMock.setObject(
    `w/${wId}/sandboxes/${spaceId}.json`,
    JSON.stringify(policy)
  );
}

describe("GET/PUT /api/w/:wId/spaces/:spaceId/sandbox/egress-policy", () => {
  beforeEach(() => {
    // The GCS global mock (registered in vite.setup.ts) is reset before each
    // test; enable real not-found semantics so reads round-trip through the
    // in-memory object store and unwritten paths 404 like real GCS.
    fileStorageMock.setFetchFileContentNotFound(() => true);
  });

  it("returns an empty policy when no pod policy file exists", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy: { allowedDomains: [] },
      requestedDomains: [],
    });
  });

  it("persists domains and returns them on round-trip, normalized", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const putResponse = await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["API.GitHub.COM", "*.GitHub.COM"],
    });

    expect(putResponse.status).toBe(200);
    expect(await putResponse.json()).toEqual({
      policy: { allowedDomains: ["api.github.com", "*.github.com"] },
    });

    // The GCS object landed at the pod's owner path.
    expect(
      fileStorageMock.getObject(`w/${workspace.sId}/sandboxes/${pod.sId}.json`)
    ).toBe(
      JSON.stringify({ allowedDomains: ["api.github.com", "*.github.com"] })
    );

    const getResponse = await getPolicy(workspace.sId, pod.sId);
    expect(await getResponse.json()).toEqual({
      policy: { allowedDomains: ["api.github.com", "*.github.com"] },
      requestedDomains: [],
    });

    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_egress_policy.updated",
        metadata: expect.objectContaining({
          allowed_domains: "api.github.com,*.github.com",
          space_id: pod.sId,
        }),
      })
    );
  });

  it("rejects invalid domain entries and writes nothing", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const response = await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["127.0.0.1"],
    });

    expect(response.status).toBe(400);
    expect(
      fileStorageMock.getObject(`w/${workspace.sId}/sandboxes/${pod.sId}.json`)
    ).toBeUndefined();
  });

  it("lets a non-admin Pod member read the policy", async () => {
    const { workspace, user } = await setupTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace, user.id);
    seedPolicyFile(workspace.sId, pod.sId, {
      allowedDomains: ["api.github.com"],
    });

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy: { allowedDomains: ["api.github.com"] },
      requestedDomains: [],
    });
  });

  it("hides the Pod from a user who cannot access it", async () => {
    const { workspace } = await setupTest({ role: "user" });
    // The user is not a member of this Pod, so it is not visible to them.
    const pod = await SpaceFactory.project(workspace);

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(404);
  });

  it("rejects a non-admin Pod member's write with a 403", async () => {
    const { workspace, user } = await setupTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace, user.id);

    const response = await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["api.github.com"],
    });

    expect(response.status).toBe(403);
    expect(
      fileStorageMock.getObject(`w/${workspace.sId}/sandboxes/${pod.sId}.json`)
    ).toBeUndefined();
  });

  it("lets a non-admin Pod member request a domain for review", async () => {
    const { workspace, user } = await setupTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace, user.id);

    const response = await requestDomain(
      workspace.sId,
      pod.sId,
      "api.stripe.com"
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("requested");
    // The request is recorded but never granted.
    expect(body.policy.allowedDomains).toEqual([]);
    expect(
      body.policy.requestedDomains.map((r: { domain: string }) => r.domain)
    ).toContain("api.stripe.com");
  });

  it("reports already_allowed without recording a request", async () => {
    const { workspace, user } = await setupTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace, user.id);
    seedPolicyFile(workspace.sId, pod.sId, {
      allowedDomains: ["api.github.com"],
    });

    const response = await requestDomain(
      workspace.sId,
      pod.sId,
      "api.github.com"
    );

    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe("already_allowed");

    const getResponse = await getPolicy(workspace.sId, pod.sId);
    expect((await getResponse.json()).requestedDomains).toEqual([]);
  });

  it("hides the request route from a user who cannot access the Pod", async () => {
    const { workspace } = await setupTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace);

    const response = await requestDomain(
      workspace.sId,
      pod.sId,
      "api.stripe.com"
    );

    expect(response.status).toBe(404);
  });

  it("rejects an invalid requested domain with a 400", async () => {
    const { workspace, user } = await setupTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace, user.id);

    const response = await requestDomain(workspace.sId, pod.sId, "127.0.0.1");

    expect(response.status).toBe(400);
    expect(
      fileStorageMock.getObject(`w/${workspace.sId}/sandboxes/${pod.sId}.json`)
    ).toBeUndefined();
  });

  it("rejects workspaces without the frames_v2 flag with a 403", async () => {
    const { workspace } = await setupTest({ enableSandboxFunctions: false });
    const pod = await SpaceFactory.project(workspace);

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });

  it("surfaces pending domain requests from the policy file", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);
    seedPolicyFile(workspace.sId, pod.sId, {
      allowedDomains: ["api.github.com"],
      requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
    });

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
      },
      requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
    });
  });

  it("dismisses a pending request without granting it", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);
    seedPolicyFile(workspace.sId, pod.sId, {
      allowedDomains: ["api.github.com"],
      requestedDomains: [
        { domain: "api.stripe.com", requestedAtMs: 1 },
        { domain: "api.notion.com", requestedAtMs: 2 },
      ],
    });

    const response = await dismissRequest(
      workspace.sId,
      pod.sId,
      "api.stripe.com"
    );

    expect(response.status).toBe(200);
    const getResponse = await getPolicy(workspace.sId, pod.sId);
    expect(await getResponse.json()).toEqual({
      policy: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.notion.com", requestedAtMs: 2 }],
      },
      requestedDomains: [{ domain: "api.notion.com", requestedAtMs: 2 }],
    });
  });

  it("resolves a request atomically when its domain is approved via PUT", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);
    seedPolicyFile(workspace.sId, pod.sId, {
      allowedDomains: [],
      requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
    });

    await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["api.stripe.com"],
    });

    const getResponse = await getPolicy(workspace.sId, pod.sId);
    expect(await getResponse.json()).toEqual({
      policy: { allowedDomains: ["api.stripe.com"] },
      requestedDomains: [],
    });
  });

  it("rejects a non-admin dismiss with a 403", async () => {
    const { workspace } = await setupTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace);

    const response = await dismissRequest(
      workspace.sId,
      pod.sId,
      "api.stripe.com"
    );

    expect(response.status).toBe(403);
  });

  it("returns 400 for non-project spaces", async () => {
    const { workspace } = await setupTest();
    const regularSpace = await SpaceFactory.regular(workspace);

    const getResponse = await getPolicy(workspace.sId, regularSpace.sId);
    expect(getResponse.status).toBe(400);
    expect((await getResponse.json()).error.type).toBe("invalid_request_error");

    const putResponse = await putPolicy(workspace.sId, regularSpace.sId, {
      allowedDomains: ["api.github.com"],
    });
    expect(putResponse.status).toBe(400);
  });
});
