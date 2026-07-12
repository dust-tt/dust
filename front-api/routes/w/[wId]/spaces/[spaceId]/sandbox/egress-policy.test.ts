import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it } from "vitest";

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
    expect(await response.json()).toEqual({ policy: { allowedDomains: [] } });
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
    });
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
