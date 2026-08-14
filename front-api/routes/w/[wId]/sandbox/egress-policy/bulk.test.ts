import { writeOwnerPolicy } from "@app/lib/api/sandbox/egress_policy";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { GetPodEgressPoliciesBulkResponseBody } from "@app/types/api/sandbox/egress_policy";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  const { workspace, auth, user, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  const podA = await SpaceFactory.project(workspace, user.id);
  const podB = await SpaceFactory.project(workspace, user.id);

  return { workspace, auth, user, podA, podB, ...rest };
}

function getBulk(wId: string, query: string) {
  return honoApp.request(`/api/w/${wId}/sandbox/egress-policy/bulk?${query}`);
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
