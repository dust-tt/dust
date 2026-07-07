import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadOwnerPolicy, mockWriteOwnerPolicy } = vi.hoisted(() => ({
  mockReadOwnerPolicy: vi.fn(),
  mockWriteOwnerPolicy: vi.fn(),
}));

vi.mock("@app/lib/api/sandbox/egress_policy", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/egress_policy")>();

  return {
    ...actual,
    readOwnerPolicy: mockReadOwnerPolicy,
    writeOwnerPolicy: mockWriteOwnerPolicy,
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

    mockReadOwnerPolicy.mockResolvedValue(
      new Ok({ allowedDomains: ["api.github.com"] })
    );
    mockWriteOwnerPolicy.mockImplementation(
      async (
        _auth: unknown,
        _ownerId: unknown,
        { policy }: { policy: { allowedDomains: string[] } }
      ) => {
        return new Ok(policy);
      }
    );
  });

  it("returns the pod egress policy to workspace admins", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy: { allowedDomains: ["api.github.com"] },
    });
    expect(mockReadOwnerPolicy).toHaveBeenCalledWith(
      expect.anything(),
      pod.sId
    );
  });

  it("updates the pod egress policy with normalized domains", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const response = await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["API.GitHub.COM", "*.GitHub.COM"],
    });

    expect(response.status).toBe(200);
    expect(mockWriteOwnerPolicy).toHaveBeenCalledWith(
      expect.anything(),
      pod.sId,
      {
        policy: {
          allowedDomains: ["api.github.com", "*.github.com"],
        },
      }
    );
    expect(await response.json()).toEqual({
      policy: {
        allowedDomains: ["api.github.com", "*.github.com"],
      },
    });
  });

  it("rejects invalid domain entries", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const response = await putPolicy(workspace.sId, pod.sId, {
      allowedDomains: ["127.0.0.1"],
    });

    expect(response.status).toBe(400);
    expect(mockWriteOwnerPolicy).not.toHaveBeenCalled();
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

  it("returns 500 when storage read fails", async () => {
    const { workspace } = await setupTest();
    const pod = await SpaceFactory.project(workspace);
    mockReadOwnerPolicy.mockResolvedValue(new Err(new Error("GCS failed")));

    const response = await getPolicy(workspace.sId, pod.sId);

    expect(response.status).toBe(500);
  });
});
