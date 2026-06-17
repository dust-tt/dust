import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
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

function getSpaces(workspace: { sId: string }, query = "") {
  return honoApp.request(`/api/w/${workspace.sId}/spaces${query}`);
}

function postSpace(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/w/:wId/spaces", () => {
  it("does not trust the role query parameter for non-admin users", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    await SpaceFactory.regular(workspace);

    const response = await getSpaces(workspace, "?role=admin");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Only users that are `admins` can list spaces as admin.",
      },
    });
  });

  it("allows admins to list all workspace spaces", async () => {
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const memberSpace = await SpaceFactory.regular(workspace);
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(memberSpace, globalGroup);

    const response = await getSpaces(workspace, "?role=admin");

    expect(response.status).toBe(200);
    const { spaces } = await response.json();
    expect(spaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sId: memberSpace.sId }),
        expect.objectContaining({ sId: restrictedSpace.sId }),
      ])
    );
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
