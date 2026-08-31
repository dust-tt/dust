import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function setupTest({
  role = "admin",
  disableComputerFeature = false,
  enableSandboxFunctions = true,
}: {
  role?: MembershipRoleType;
  disableComputerFeature?: boolean;
  enableSandboxFunctions?: boolean;
} = {}) {
  const { workspace, auth, user, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (enableSandboxFunctions) {
    await FeatureFlagFactory.basic(auth, "sandbox_functions");
  }
  if (disableComputerFeature) {
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");
  }

  const podA = await SpaceFactory.project(workspace, user.id);
  const podB = await SpaceFactory.project(workspace, user.id);

  return { workspace, auth, user, podA, podB, ...rest };
}

function getBulk(wId: string, query: string) {
  return honoApp.request(`/api/w/${wId}/sandbox/env-vars/bulk?${query}`);
}

describe("GET /api/w/:wId/sandbox/env-vars/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace, podA } = await setupTest({ role: "user" });

    const response = await getBulk(workspace.sId, `podIds=${podA.sId}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("returns 403 when Computer is disabled", async () => {
    const { workspace, podA } = await setupTest({
      disableComputerFeature: true,
    });

    const response = await getBulk(workspace.sId, `podIds=${podA.sId}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });

  it("returns the selected pods' env vars flat, without workspace rows", async () => {
    const { workspace, auth, podA, podB } = await setupTest();

    for (const [scope, name] of [
      [
        {
          kind: "workspace" as const,
          workspace: auth.getNonNullableWorkspace(),
        },
        "WORKSPACE_TOKEN",
      ],
      [{ kind: "pod" as const, pod: podA }, "A_TOKEN"],
      [{ kind: "pod" as const, pod: podB }, "B_TOKEN"],
    ] as const) {
      const upsert = await SandboxEnvVarResource.upsert(auth, scope, {
        name,
        value: "value",
      });
      if (upsert.isErr()) {
        throw upsert.error;
      }
    }

    const response = await getBulk(
      workspace.sId,
      `podIds=${podA.sId},${podB.sId}`
    );

    expect(response.status).toBe(200);
    // toMatchObject on an array also pins its length; ordered by name.
    expect(await response.json()).toMatchObject({
      envVars: [
        { name: "DST_A_TOKEN", spaceId: podA.sId },
        { name: "DST_B_TOKEN", spaceId: podB.sId },
      ],
    });
  });

  it("supports repeated podIds params and drops unknown ids", async () => {
    const { workspace, auth, podA } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod: podA },
      { name: "A_TOKEN", value: "value" }
    );
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await getBulk(
      workspace.sId,
      `podIds=${podA.sId}&podIds=spc_unknown`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      envVars: [{ name: "DST_A_TOKEN", spaceId: podA.sId }],
    });
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

    for (const [pod, name] of [
      [podA, "A_TOKEN"],
      [archivedPod, "ARCHIVED_TOKEN"],
    ] as const) {
      const upsert = await SandboxEnvVarResource.upsert(
        auth,
        { kind: "pod", pod },
        { name, value: "value" }
      );
      if (upsert.isErr()) {
        throw upsert.error;
      }
    }

    const response = await getBulk(workspace.sId, "scope=all-pods");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      envVars: [{ name: "DST_A_TOKEN", spaceId: podA.sId }],
    });
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
