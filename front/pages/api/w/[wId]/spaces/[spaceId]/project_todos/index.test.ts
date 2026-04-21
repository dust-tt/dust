import { Authenticator } from "@app/lib/auth";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ProjectTodoFactory } from "@app/tests/utils/ProjectTodoFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { WorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import type { MockRequest, MockResponse } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./index";

describe("GET /api/w/[wId]/spaces/[spaceId]/project_todos", () => {
  let req: MockRequest<NextApiRequest>;
  let res: MockResponse<NextApiResponse>;
  let workspace: WorkspaceType;

  async function setup(method = "GET") {
    const result = await createPrivateApiMockRequest({ method: method as any });
    req = result.req;
    res = result.res;
    workspace = result.workspace;
    return result;
  }

  it("should return 200 with an empty list when no todos exist", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.todos).toEqual([]);
    expect(data.lastReadAt).toBeNull();
  });

  it("should return latest versions of todos for the space", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "First todo",
    });
    // Create a new version of the same todo.
    await todo.updateWithVersion(auth, { text: "Updated todo" });

    req.query.spaceId = project.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { todos, lastReadAt } = res._getJSONData();
    // Only the latest version should appear.
    expect(todos).toHaveLength(1);
    expect(todos[0].text).toBe("Updated todo");
    expect(todos[0].sId).toBe(todo.sId);
    expect(lastReadAt).toBeNull();
  });

  it("should return 400 for non-project spaces", async () => {
    const { user } = await setup();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const regularSpace = await SpaceFactory.regular(workspace);

    // Add the user to the space so auth passes and we reach the handler logic.
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
    const { user } = await setup("DELETE");
    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
