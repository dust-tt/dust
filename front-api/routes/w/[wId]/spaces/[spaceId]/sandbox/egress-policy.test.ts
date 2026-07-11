import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock one level down at the storage layer: the route exercises the real
// readOwnerPolicy / writeOwnerPolicy, and only GCS is faked. `gcsStore` is an
// in-memory object store keyed by file path.
const { gcsStore, inMemoryBucket } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    gcsStore: store,
    inMemoryBucket: {
      uploadRawContentToBucket: async ({
        content,
        filePath,
      }: {
        content: string;
        filePath: string;
      }) => {
        store.set(filePath, content);
      },
      fetchFileContent: async (filePath: string) => {
        const content = store.get(filePath);
        if (content === undefined) {
          // Mirror the GCS "object not found" shape isGCSNotFoundError reads.
          throw { code: 404 };
        }
        return content;
      },
      delete: async (filePath: string) => {
        store.delete(filePath);
      },
    },
  };
});

// Full replacement (not importOriginal): evaluating the real module needs
// SERVICE_ACCOUNT. `getBucketInstance` is the seam the egress policy code
// uses; the other bucket getters are stubbed so booting the full route app
// doesn't hit real GCS construction.
vi.mock("@app/lib/file_storage", () => ({
  getBucketInstance: vi.fn(() => inMemoryBucket),
  getPrivateUploadBucket: vi.fn(() => inMemoryBucket),
  getPublicUploadBucket: vi.fn(() => inMemoryBucket),
  getUpsertQueueBucket: vi.fn(() => inMemoryBucket),
  getDustDataSourcesBucket: vi.fn(() => inMemoryBucket),
  getWebhookRequestsBucket: vi.fn(() => inMemoryBucket),
  getLLMTracesBucket: vi.fn(() => inMemoryBucket),
  getPokeUserConfigBucket: vi.fn(() => inMemoryBucket),
}));

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
    gcsStore.clear();
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
    expect(gcsStore.get(`w/${workspace.sId}/sandboxes/${pod.sId}.json`)).toBe(
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
    expect(gcsStore.size).toBe(0);
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
