import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

import handler from "./members";

describe("PATCH /api/w/[wId]/spaces/[spaceId]/members", () => {
  it("blocks making a restricted project open when open projects are disabled", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    await WorkspaceResource.updateMetadata(workspace.id, {
      ...(workspace.metadata ?? {}),
      allowOpenProjects: false,
    });

    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;
    req.body = {
      name: project.name,
      isRestricted: false,
      managementMode: "manual",
      memberIds: [],
      editorIds: [user.sId],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Open projects are disabled by your workspace admin. Keep this project private.",
      },
    });
  });

  it("allows making a restricted project open when open projects are allowed", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;
    req.body = {
      name: project.name,
      isRestricted: false,
      managementMode: "manual",
      memberIds: [],
      editorIds: [user.sId],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().space).toEqual(
      expect.objectContaining({
        sId: project.sId,
      })
    );
  });
});
