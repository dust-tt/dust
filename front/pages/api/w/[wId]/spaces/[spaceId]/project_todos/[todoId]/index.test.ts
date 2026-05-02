import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { ProjectTodoFactory } from "@app/tests/utils/ProjectTodoFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { WorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import type { MockRequest, MockResponse } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from ".";

describe("PATCH /api/w/[wId]/spaces/[spaceId]/project_todos/[todoId]", () => {
  let req: MockRequest<NextApiRequest>;
  let res: MockResponse<NextApiResponse>;
  let workspace: WorkspaceType;

  async function setup() {
    const result = await createPrivateApiMockRequest({ method: "PATCH" });
    req = result.req;
    res = result.res;
    workspace = result.workspace;
    return result;
  }

  it("should edit the text of a todo", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "Original text",
    });

    req.query.spaceId = project.sId;
    req.query.todoId = todo.sId;
    req.body = { text: "Updated text" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { todo: updated } = res._getJSONData();
    expect(updated.text).toBe("Updated text");
    expect(updated.sId).toBe(todo.sId);
  });

  it("should mark a todo as done", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
    });

    req.query.spaceId = project.sId;
    req.query.todoId = todo.sId;
    req.body = { status: "done" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { todo: updated } = res._getJSONData();
    expect(updated.status).toBe("done");
    expect(updated.markedAsDoneByType).toBe("user");
    expect(updated.doneAt).not.toBeNull();
  });

  it("should allow un-marking a done todo", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
    });
    const doneTodo = await todo.updateWithVersion(auth, {
      status: "done",
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
      doneAt: new Date(),
    });

    req.query.spaceId = project.sId;
    req.query.todoId = doneTodo.sId;
    req.body = { status: "todo" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { todo: updated } = res._getJSONData();
    expect(updated.status).toBe("todo");
    expect(updated.markedAsDoneByType).toBeNull();
    expect(updated.doneAt).toBeNull();
  });

  it("should return 404 for a non-existent todo", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);

    req.query.spaceId = project.sId;
    req.query.todoId = "nonexistent_todo_sid";
    req.body = { text: "Update" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("project_todo_not_found");
  });

  it("should return 404 for a todo that belongs to a different space", async () => {
    const { user } = await setup();
    const project1 = await SpaceFactory.project(workspace, user.id);
    const project2 = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project1, {
      userId: user.id,
    });

    req.query.spaceId = project2.sId;
    req.query.todoId = todo.sId;
    req.body = { text: "Update" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("project_todo_not_found");
  });

  it("should allow updating a todo assigned to another project member", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherTodo = await ProjectTodoFactory.create(workspace, project, {
      userId: otherUser.id,
      text: "Other member todo",
    });

    req.query.spaceId = project.sId;
    req.query.todoId = otherTodo.sId;
    req.body = { text: "Edited by project member", status: "done" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { todo: updated } = res._getJSONData();
    expect(updated.text).toBe("Edited by project member");
    expect(updated.status).toBe("done");
    expect(updated.user?.sId).toBe(otherUser.sId);
  });

  it("should reassign a todo to another project member", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const memberGroup =
      project.groups.find((g) => g.kind === "regular") ?? project.groups[0]!;
    await GroupFactory.withMembers(adminAuth, memberGroup, [otherUser]);

    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "Hand off this",
    });

    req.query.spaceId = project.sId;
    req.query.todoId = todo.sId;
    req.body = { assigneeUserId: otherUser.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { todo: updated } = res._getJSONData();
    expect(updated.user?.sId).toBe(otherUser.sId);
    expect(updated.text).toBe("Hand off this");
  });

  it("should return 400 when no update fields are provided", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
    });

    req.query.spaceId = project.sId;
    req.query.todoId = todo.sId;
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("should return 405 for unsupported methods", async () => {
    const result = await createPrivateApiMockRequest({ method: "GET" });
    req = result.req;
    res = result.res;
    workspace = result.workspace;

    const { user } = result;
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
    });

    req.query.spaceId = project.sId;
    req.query.todoId = todo.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
