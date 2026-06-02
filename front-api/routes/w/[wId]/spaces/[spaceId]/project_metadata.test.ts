import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLaunchOrSignalProjectTodoWorkflow,
  mockStartImmediateProjectTodoWorkflowOnce,
  mockStopProjectTodoWorkflow,
} = vi.hoisted(() => ({
  mockLaunchOrSignalProjectTodoWorkflow: vi.fn(),
  mockStartImmediateProjectTodoWorkflowOnce: vi.fn(),
  mockStopProjectTodoWorkflow: vi.fn(),
}));

vi.mock("@app/temporal/project_task/client", () => ({
  launchOrSignalProjectTodoWorkflow: mockLaunchOrSignalProjectTodoWorkflow,
  startImmediateProjectTodoWorkflowOnce:
    mockStartImmediateProjectTodoWorkflowOnce,
  stopProjectTodoWorkflow: mockStopProjectTodoWorkflow,
}));

import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import { honoApp } from "@front-api/app";

function getMetadata(workspace: { sId: string }, spaceId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_metadata`
  );
}

function patchMetadata(
  workspace: { sId: string },
  spaceId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_metadata`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/w/:wId/spaces/:spaceId/project_metadata", () => {
  it("returns metadata for project spaces", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test description",
    });

    const response = await getMetadata(workspace, projectSpace.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.projectMetadata.description).toBe("Test description");
  });

  it("returns 400 for non-project spaces", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const regularSpace = await SpaceFactory.regular(workspace);

    const response = await getMetadata(workspace, regularSpace.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("PATCH /api/w/:wId/spaces/:spaceId/project_metadata", () => {
  it("creates and updates metadata", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const projectSpace = await SpaceFactory.project(workspace);

    const response = await patchMetadata(workspace, projectSpace.sId, {
      description: "New description",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.projectMetadata.description).toBe("New description");
  });

  it("denies non-admin users", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });

    const projectSpace = await SpaceFactory.project(workspace);

    const { Authenticator } = await import("@app/lib/auth");
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const [spaceGroup] = projectSpace.groups.filter((g) => !g.isGlobal());
    await spaceGroup.dangerouslyAddMembers(adminAuth, {
      users: [user.toJSON()],
    });

    const response = await patchMetadata(workspace, projectSpace.sId, {
      description: "Should fail",
    });

    expect(response.status).toBe(403);
  });

  it("stops project tasks workflow when archiving a project", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test description",
      archivedAt: null,
    });

    const response = await patchMetadata(workspace, projectSpace.sId, {
      archive: true,
    });

    expect(response.status).toBe(200);
    expect(mockStopProjectTodoWorkflow).toHaveBeenCalledTimes(1);
    expect(mockStopProjectTodoWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: projectSpace.sId })
    );
    expect(mockLaunchOrSignalProjectTodoWorkflow).not.toHaveBeenCalled();
  });

  it("updates tasks generation opt-in", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test",
    });

    const response = await patchMetadata(workspace, projectSpace.sId, {
      todoGenerationEnabled: true,
      initialTodoAnalysisLookback: "last_24h",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.projectMetadata.todoGenerationEnabled).toBe(true);
    expect(mockLaunchOrSignalProjectTodoWorkflow).toHaveBeenCalledTimes(1);
    expect(mockStartImmediateProjectTodoWorkflowOnce).toHaveBeenCalledTimes(1);
  });

  it("restarts project tasks workflow when unarchiving a project", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test description",
      archivedAt: new Date(),
    });

    const response = await patchMetadata(workspace, projectSpace.sId, {
      archive: false,
    });

    expect(response.status).toBe(200);
    expect(mockLaunchOrSignalProjectTodoWorkflow).toHaveBeenCalledTimes(1);
    expect(mockLaunchOrSignalProjectTodoWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: projectSpace.sId })
    );
    expect(mockStopProjectTodoWorkflow).not.toHaveBeenCalled();
  });
});
