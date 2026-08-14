import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { GetSpacesResponseBody } from "@app/types/api/spaces";
import type { SpaceKind } from "@app/types/space";
import { describe, expect, it, vi } from "vitest";

const { mockCreateSpaceAndGroup } = vi.hoisted(() => ({
  mockCreateSpaceAndGroup: vi.fn(),
}));

vi.mock("@app/lib/api/spaces", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/api/spaces")>()),
  createSpaceAndGroup: mockCreateSpaceAndGroup,
}));

vi.mock("@app/lib/api/audit/workos_audit", () => ({
  buildAuditLogTarget: vi.fn(() => ({ type: "mock_target" })),
  emitAuditLogEvent: vi.fn(),
  getAuditLogContext: vi.fn(() => ({})),
}));

import { honoApp } from "@front-api/app";

function postSpace(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getSpaces(workspace: { sId: string }, kinds?: SpaceKind[]) {
  const query = kinds
    ?.map((kind) => `kind=${encodeURIComponent(kind)}`)
    .join("&");

  return honoApp.request(
    `/api/w/${workspace.sId}/spaces${query ? `?${query}` : ""}`
  );
}

describe("GET /api/w/:wId/spaces", () => {
  it("filters by repeated kinds and only enriches projects", async () => {
    const { workspace, user, auth, globalSpace } =
      await createPrivateApiMockRequest();
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Project description",
    });

    const metadataFetch = vi.spyOn(
      ProjectMetadataResource,
      "fetchBySpaceModelIds"
    );

    const globalResponse = await getSpaces(workspace, ["global"]);
    expect(globalResponse.status).toBe(200);
    const globalData = (await globalResponse.json()) as GetSpacesResponseBody;
    expect(globalData.spaces).toEqual([
      expect.objectContaining({ sId: globalSpace.sId, kind: "global" }),
    ]);
    expect(metadataFetch).not.toHaveBeenCalled();

    const mixedResponse = await getSpaces(workspace, ["global", "project"]);
    expect(mixedResponse.status).toBe(200);
    const mixedData = (await mixedResponse.json()) as GetSpacesResponseBody;
    expect(mixedData.spaces.map((space) => space.sId)).toEqual(
      expect.arrayContaining([globalSpace.sId, projectSpace.sId])
    );
    expect(mixedData.spaces).toContainEqual(
      expect.objectContaining({
        sId: projectSpace.sId,
        kind: "project",
        description: "Project description",
      })
    );
    expect(metadataFetch).toHaveBeenCalledOnce();
  });

  it("rejects invalid kinds", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?kind=invalid`
    );

    expect(response.status).toBe(400);
  });
});

describe("GET /api/w/:wId/spaces?role=admin&kind=project", () => {
  it("returns every non-archived pod to admins regardless of membership", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    // Pods created by another user; the admin is a member of none of them.
    const pod = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, pod, { description: null });
    const archivedPod = await SpaceFactory.project(workspace);
    const archivedMetadata = await ProjectMetadataResource.makeNew(
      auth,
      archivedPod,
      { description: null }
    );
    await archivedMetadata.archive();
    // No metadata row: treated as invalid and excluded.
    await SpaceFactory.project(workspace);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?role=admin&kind=project`
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as GetSpacesResponseBody;
    expect(data.spaces.map((space) => space.sId)).toEqual([pod.sId]);
    expect(data.spaces[0]).toMatchObject({
      kind: "project",
      isMember: false,
    });
  });

  it("rejects non-admins asking for the project listing", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    await ProjectMetadataResource.makeNew(auth, pod, { description: null });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?role=admin&kind=project`
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });
});

describe("POST /api/w/:wId/spaces", () => {
  it("blocks creating an open project when open projects are disabled", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    await WorkspaceResource.updateMetadata(workspace.id, {
      ...(workspace.metadata ?? {}),
      allowOpenProjects: false,
    });

    const response = await postSpace(workspace, {
      name: "Open project should fail",
      isRestricted: false,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    });

    expect(response.status).toBe(403);
    expect(mockCreateSpaceAndGroup).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Open projects are disabled by your workspace admin. Create a private project instead.",
      },
    });
  });

  it("allows creating an open project when open projects are allowed", async () => {
    mockCreateSpaceAndGroup.mockResolvedValue({
      isErr: () => false,
      value: {
        sId: "vlt_mockProject",
        name: "Open project is allowed",
        kind: "project",
        toJSON: () => ({
          sId: "vlt_mockProject",
          kind: "project",
          isRestricted: false,
        }),
      },
    });

    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const response = await postSpace(workspace, {
      name: "Open project is allowed",
      isRestricted: false,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    });

    expect(response.status).toBe(201);
    expect(mockCreateSpaceAndGroup).toHaveBeenCalledTimes(1);
    const data = await response.json();
    expect(data.space).toEqual(
      expect.objectContaining({
        kind: "project",
        isRestricted: false,
      })
    );
  });
});
