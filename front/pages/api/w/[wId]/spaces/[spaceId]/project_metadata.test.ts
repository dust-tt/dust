import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./project_metadata";

describe("GET /api/w/[wId]/spaces/[spaceId]/project_metadata", () => {
  it("returns metadata for project spaces", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({ role: "admin" });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.spaceId = projectSpace.sId;

    await ProjectMetadataResource.makeNew(authenticator, projectSpace, {
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
