import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

function getPods(wId: string) {
  return honoApp.request(`/api/w/${wId}/sandbox/egress-policy/pods`);
}

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

describe("GET /api/w/:wId/sandbox/egress-policy/pods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.setFetchFileContentNotFound(() => true);
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await getPods(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("returns only Pods that have their own policy, with names", async () => {
    const { workspace, podA } = await setupTest();
    // podA is configured; podB is a live Pod with no policy.
    markConfigured(workspace.sId, [podA]);

    const response = await getPods(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pods: [{ sId: podA.sId, name: podA.name, isRestricted: true }],
    });
  });

  it("excludes archived Pods even when they have a policy", async () => {
    const { workspace, auth } = await setupTest();
    const archivedPod = await SpaceFactory.project(workspace);
    const metadata = await ProjectMetadataResource.makeNew(auth, archivedPod, {
      description: null,
    });
    await metadata.archive();
    markConfigured(workspace.sId, [archivedPod]);

    const response = await getPods(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pods: [] });
  });

  it("returns 403 when frames_v2 is disabled", async () => {
    const { workspace } = await setupTest({ enableSandboxFunctions: false });

    const response = await getPods(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });

  it("returns a 500 when the Pod listing fails", async () => {
    const { workspace } = await setupTest();
    fileStorageMock.setFilesByPrefix(() => {
      throw new Error("gcs unavailable");
    });

    const response = await getPods(workspace.sId);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
