import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
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

  it("lists Pods to admins asking for them with the admin role", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const projectSpace = await SpaceFactory.project(workspace, user.id);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?role=admin&kind=project&kind=regular`
    );

    expect(response.status).toBe(200);
    const data: unknown = await response.json();
    expect(data).toEqual({
      spaces: expect.arrayContaining([
        expect.objectContaining({ sId: projectSpace.sId }),
      ]),
    });
    expect(data).not.toEqual({
      spaces: expect.arrayContaining([
        expect.objectContaining({ kind: "global" }),
      ]),
    });
  });

  it("does not list Pods to non-admins asking with the admin role", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    const projectSpace = await SpaceFactory.project(workspace);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?role=admin&kind=project`
    );

    expect(response.status).toBe(200);
    const data: unknown = await response.json();
    expect(data).toEqual({ spaces: expect.any(Array) });
    expect(data).not.toEqual({
      spaces: expect.arrayContaining([
        expect.objectContaining({ sId: projectSpace.sId }),
      ]),
    });
  });

  it("does not list restricted regular spaces nor their groups to non-admins asking with the admin role", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const [{ groupIds: restrictedGroupIds }] =
      await SpaceResource.enrichSpacesWithAccess(adminAuth, [restrictedSpace]);
    expect(restrictedGroupIds.length).toBeGreaterThan(0);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?role=admin&kind=regular`
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as GetSpacesResponseBody;
    expect(data.spaces.map((space) => space.sId)).not.toContain(
      restrictedSpace.sId
    );
    const returnedGroupIds = data.spaces.flatMap((space) => space.groupIds);
    expect(returnedGroupIds).not.toEqual(
      expect.arrayContaining(restrictedGroupIds)
    );
  });

  it("gives non-admins asking with the admin role their member view", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const memberSpace = await SpaceFactory.regular(workspace);
    await memberSpace.addMembers(adminAuth, { userIds: [user.sId] });
    await SpaceFactory.regular(workspace);
    await auth.refresh();

    const adminViewResponse = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?role=admin&kind=regular&kind=global`
    );
    const memberViewResponse = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?kind=regular&kind=global`
    );

    expect(adminViewResponse.status).toBe(200);
    expect(memberViewResponse.status).toBe(200);
    const adminView = (await adminViewResponse.json()) as GetSpacesResponseBody;
    expect(adminView.spaces.map((space) => space.sId)).toContain(
      memberSpace.sId
    );
    expect(adminView).toEqual(await memberViewResponse.json());
  });

  it("still returns the system space to non-admins asking for it with the admin role", async () => {
    const { workspace, systemSpace } = await createPrivateApiMockRequest({
      role: "user",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?role=admin&kind=system`
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as GetSpacesResponseBody;
    expect(data.spaces).toEqual([
      expect.objectContaining({ sId: systemSpace.sId, kind: "system" }),
    ]);
  });

  it("lists every regular space to admins asking with the admin role", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const restrictedSpace = await SpaceFactory.regular(workspace);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces?role=admin&kind=regular`
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as GetSpacesResponseBody;
    expect(data.spaces).toContainEqual(
      expect.objectContaining({
        sId: restrictedSpace.sId,
        kind: "regular",
        isRestricted: true,
      })
    );
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

  it("rejects a pod name longer than 256 characters", async () => {
    mockCreateSpaceAndGroup.mockClear();
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const response = await postSpace(workspace, {
      name: "p".repeat(257),
      isRestricted: true,
      spaceKind: "project",
      memberIds: [],
    });

    expect(response.status).toBe(400);
    expect(mockCreateSpaceAndGroup).not.toHaveBeenCalled();
  });
});
