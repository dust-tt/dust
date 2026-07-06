import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockWritePodPolicy } = vi.hoisted(() => ({
  mockWritePodPolicy: vi.fn(),
}));

// Stub the GCS projection so we can assert it fires without a real bucket.
vi.mock("@app/lib/api/sandbox/egress_policy", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/egress_policy")>();

  return {
    ...actual,
    writePodPolicy: mockWritePodPolicy,
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
    await FeatureFlagFactory.basic(auth, "sandbox_functions");
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

describe("GET/PUT /api/w/:wId/spaces/:spaceId/sandbox/egress-policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWritePodPolicy.mockResolvedValue(new Ok({ allowedDomains: [] }));
  });

  it("returns an empty policy when no pod domains are configured", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ policy: { allowedDomains: [] } });
  });

  it("saves normalized domains and returns them on round-trip", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const putResponse = await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["API.GitHub.COM", "*.GitHub.COM"],
    });

    expect(putResponse.status).toBe(200);
    expect(await putResponse.json()).toEqual({
      policy: { allowedDomains: ["api.github.com", "*.github.com"] },
    });

    const getResponse = await getPolicy(workspace.sId, pod.sId);
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      policy: { allowedDomains: ["api.github.com", "*.github.com"] },
    });
  });

  it("projects the allowlist onto a live pod sandbox", async () => {
    const { workspace, auth } = await setupTest();
    const pod = await SpaceFactory.project(workspace);
    const sandbox = await SandboxFactory.createForPod(auth, pod, {
      status: "running",
    });

    const response = await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["API.GitHub.COM"],
    });

    expect(response.status).toBe(200);
    expect(mockWritePodPolicy).toHaveBeenCalledWith(sandbox.providerId, [
      "api.github.com",
    ]);
  });

  it("does not project when the pod has no sandbox", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const response = await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["api.github.com"],
    });

    expect(response.status).toBe(200);
    expect(mockWritePodPolicy).not.toHaveBeenCalled();
  });

  it("rejects invalid domain entries with a 400", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const response = await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["127.0.0.1"],
    });

    expect(response.status).toBe(400);

    // The invalid write must not have been persisted.
    const getResponse = await getPolicy(workspace.sId, pod.sId);
    expect(await getResponse.json()).toEqual({
      policy: { allowedDomains: [] },
    });
  });

  it("rejects non-admin users with a 403", async () => {
    const { workspace } = await setupTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace);

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("rejects workspaces without the sandbox_functions flag with a 403", async () => {
    const { workspace } = await setupTest({ enableSandboxFunctions: false });
    const pod = await SpaceFactory.project(workspace);

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
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
