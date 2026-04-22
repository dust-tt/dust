import { Authenticator } from "@app/lib/auth";
import { ProjectTodoStateResource } from "@app/lib/resources/project_todo_state_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { WorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./mark_read";

describe("POST /api/w/[wId]/spaces/[spaceId]/project_todos/mark_read", () => {
  let workspace: WorkspaceType;

  async function setup(method = "POST") {
    const result = await createPrivateApiMockRequest({ method: method as any });
    workspace = result.workspace;
    return result;
  }

  it("should create a state row on first call and return success", async () => {
    const { req, res, user, auth } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;

    const before = Date.now();
    await handler(req, res);
    const after = Date.now();

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().success).toBe(true);

    const state = await ProjectTodoStateResource.fetchBySpace(auth, {
      spaceId: project.id,
    });
    expect(state).not.toBeNull();
    expect(state!.lastReadAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(state!.lastReadAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("should upsert lastReadAt on subsequent calls without error", async () => {
    const { req, res, user, auth } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;

    // First call.
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const firstState = await ProjectTodoStateResource.fetchBySpace(auth, {
      spaceId: project.id,
    });
    const firstReadAt = firstState!.lastReadAt;

    // Second call — reuse the same workspace/spaceId; session mock is still set
    // to the same user from setup().
    const { req: req2, res: res2 } = createMocks<
      NextApiRequest,
      NextApiResponse
    >({ method: "POST", query: { wId: workspace.sId, spaceId: project.sId } });
    await handler(req2, res2);

    expect(res2._getStatusCode()).toBe(200);

    const updatedState = await ProjectTodoStateResource.fetchBySpace(auth, {
      spaceId: project.id,
    });
    expect(updatedState!.lastReadAt.getTime()).toBeGreaterThanOrEqual(
      firstReadAt.getTime()
    );
  });

  it("should return 400 for non-project spaces", async () => {
    const { req, res, user } = await setup();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const regularSpace = await SpaceFactory.regular(workspace);

    const memberGroup = regularSpace.groups.find((g) => g.kind === "regular");
    if (memberGroup) {
      await memberGroup.dangerouslyAddMembers(adminAuth, {
        users: [user.toJSON()],
      });
    }

    req.query.spaceId = regularSpace.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("should return 405 for unsupported methods", async () => {
    const { req, res, user } = await setup("GET");
    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
