import { Authenticator } from "@app/lib/auth";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { ProjectTodoFactory } from "@app/tests/utils/ProjectTodoFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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
    expect(res._getJSONData().todos).toEqual([]);
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
    await todo.createVersion(auth, { text: "Updated todo" });

    req.query.spaceId = project.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { todos } = res._getJSONData();
    // Only the latest version should appear.
    expect(todos).toHaveLength(1);
    expect(todos[0].text).toBe("Updated todo");
    expect(todos[0].sId).toBe(todo.sId);
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

describe("POST /api/w/[wId]/spaces/[spaceId]/project_todos", () => {
  let req: MockRequest<NextApiRequest>;
  let res: MockResponse<NextApiResponse>;
  let workspace: WorkspaceType;

  async function setup() {
    const result = await createPrivateApiMockRequest({ method: "POST" });
    req = result.req;
    res = result.res;
    workspace = result.workspace;
    return result;
  }

  it("should create a todo and return 201", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;
    req.body = { category: "follow_ups", text: "New todo item" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const { todo } = res._getJSONData();
    expect(todo.text).toBe("New todo item");
    expect(todo.category).toBe("follow_ups");
    expect(todo.status).toBe("todo");
    expect(todo.version).toBe(1);
    expect(typeof todo.sId).toBe("string");
  });

  it("should create todos for different members in the same project", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);

    // Add a second user to the project.
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });
    const memberGroup = project.groups.find((g) => g.kind === "regular");
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    if (memberGroup) {
      await memberGroup.dangerouslyAddMembers(adminAuth, {
        users: [user2.toJSON()],
      });
    }

    req.query.spaceId = project.sId;
    req.body = { category: "key_decisions", text: "User1 todo" };
    await handler(req, res);
    expect(res._getStatusCode()).toBe(201);
  });

  it("should return 400 for missing required fields", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;
    req.body = { text: "Missing category" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("should return 400 for an invalid category", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;
    req.body = { category: "invalid_category", text: "Some todo" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });
});
