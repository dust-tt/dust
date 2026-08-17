import { DustError } from "@app/lib/error";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { GetSpacesResponseBody } from "@app/types/api/spaces";
import { Err } from "@app/types/shared/result";
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

  it("returns the database filesystem opt-in error from project creation", async () => {
    mockCreateSpaceAndGroup.mockResolvedValue(
      new Err(
        new DustError(
          "invalid_request_error",
          "The database-backed filesystem is not enabled for this workspace."
        )
      )
    );
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await postSpace(workspace, {
      name: "[Dust FS] Test project",
      isRestricted: true,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "The database-backed filesystem is not enabled for this workspace.",
      },
    });
  });
});
