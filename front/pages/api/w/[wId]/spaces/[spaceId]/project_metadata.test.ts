import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLaunchOrSignalProjectTodoWorkflow, mockStopProjectTodoWorkflow } =
  vi.hoisted(() => ({
    mockLaunchOrSignalProjectTodoWorkflow: vi.fn(),
    mockStopProjectTodoWorkflow: vi.fn(),
  }));

vi.mock("@app/temporal/project_todo/client", () => ({
  launchOrSignalProjectTodoWorkflow: mockLaunchOrSignalProjectTodoWorkflow,
  stopProjectTodoWorkflow: mockStopProjectTodoWorkflow,
}));

import handler from "./project_metadata";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/w/[wId]/spaces/[spaceId]/project_metadata", () => {
  it("returns metadata for project spaces", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test description",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().projectMetadata.description).toBe(
      "Test description"
    );
  });

  it("returns 400 for non-project spaces", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const regularSpace = await SpaceFactory.regular(workspace);
    req.query.spaceId = regularSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });
});

describe("PATCH /api/w/[wId]/spaces/[spaceId]/project_metadata", () => {
  it("creates and updates metadata", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;
    req.body = {
      description: "New description",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().projectMetadata.description).toBe(
      "New description"
    );
  });

  it("denies non-admin users", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const [spaceGroup] = projectSpace.groups.filter((g) => !g.isGlobal());
    await spaceGroup.dangerouslyAddMembers(adminAuth, {
      users: [user.toJSON()],
    });

    req.body = { description: "Should fail" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it("stops project todo workflow when archiving a project", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    await FeatureFlagFactory.basic(auth, "project_todo");

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test description",
      archivedAt: null,
    });

    req.query.spaceId = projectSpace.sId;
    req.body = { archive: true };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockStopProjectTodoWorkflow).toHaveBeenCalledTimes(1);
    expect(mockStopProjectTodoWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: projectSpace.sId,
      })
    );
    expect(mockLaunchOrSignalProjectTodoWorkflow).not.toHaveBeenCalled();
  });

  it("restarts project todo workflow when unarchiving a project", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    await FeatureFlagFactory.basic(auth, "project_todo");

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test description",
      archivedAt: new Date(),
    });

    req.query.spaceId = projectSpace.sId;
    req.body = { archive: false };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockLaunchOrSignalProjectTodoWorkflow).toHaveBeenCalledTimes(1);
    expect(mockLaunchOrSignalProjectTodoWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: projectSpace.sId,
      })
    );
    expect(mockStopProjectTodoWorkflow).not.toHaveBeenCalled();
  });
});

describe("unsupported methods", () => {
  it("returns 405 for DELETE/POST/PUT", async () => {
    for (const method of ["DELETE", "POST", "PUT"] as const) {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method,
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.spaceId = projectSpace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    }
  });
});
