import { writeOwnerPolicy } from "@app/lib/api/sandbox/egress_policy";
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

const BulkPoliciesResponseSchema = z.object({
  policies: z.array(
    z.object({
      podId: z.string(),
      policy: z.object({ allowedDomains: z.array(z.string()) }),
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
    await FeatureFlagFactory.basic(auth, "sandbox_functions");
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

  it("returns 403 when sandbox_functions is disabled", async () => {
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
