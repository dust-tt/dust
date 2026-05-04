import { Authenticator } from "@app/lib/auth";
import { ProjectTodoStateResource } from "@app/lib/resources/project_todo_state_resource";
import { frontSequelize } from "@app/lib/resources/storage";
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

  it("should return all assignees todos with user metadata when assignee=all", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const secondUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, secondUser, { role: "user" });

    await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "My todo",
    });
    await ProjectTodoFactory.create(workspace, project, {
      userId: secondUser.id,
      text: "Other user todo",
    });

    req.query.spaceId = project.sId;
    req.query.assignee = "all";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.todos).toHaveLength(2);
    expect(data.viewerUserId).toBe(user.sId);
    expect(data.todos[0].user).not.toBeNull();
    expect(data.todos[1].user).not.toBeNull();
  });

  it("should return only todos assigned to the viewer when assignee=mine", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const secondUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, secondUser, { role: "user" });

    await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "Mine only",
    });
    await ProjectTodoFactory.create(workspace, project, {
      userId: secondUser.id,
      text: "Not mine",
    });

    req.query.spaceId = project.sId;
    req.query.assignee = "mine";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const texts = res._getJSONData().todos.map((t: { text: string }) => t.text);
    expect(texts.sort()).toEqual(["Mine only"]);
  });

  it("should omit todos stale by updatedAt when period=last_24h", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);

    await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "Recent-ish",
    });
    const staleTodo = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "Stale update",
    });
    const stalePast = new Date(Date.now() - 48 * 60 * 60 * 1000);
    // biome-ignore lint/plugin/noRawSql: Sequelize/workspace hooks block reliable updatedAt backdating for this row
    await frontSequelize.query(
      `UPDATE project_todos SET "updatedAt" = :updatedAt WHERE id = :id AND "workspaceId" = :wid`,
      {
        replacements: {
          updatedAt: stalePast,
          id: staleTodo.id,
          wid: staleTodo.workspaceId,
        },
      }
    );

    req.query.spaceId = project.sId;
    req.query.period = "last_24h";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const texts = res._getJSONData().todos.map((t: { text: string }) => t.text);
    expect(texts).toContain("Recent-ish");
    expect(texts).not.toContain("Stale update");
  });

  it("should hide cleaned done todos for all users", async () => {
    const { user, auth } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const secondUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, secondUser, { role: "user" });

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    // Viewer has two done todos: one "old" (should be hidden) and one "new" (should remain).
    const oldDone = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "Old done",
    });
    const newDone = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "New done",
    });

    // Another user's done todo should also be hidden by the viewer's cleaning.
    const otherDone = await ProjectTodoFactory.create(workspace, project, {
      userId: secondUser.id,
      text: "Other user's done",
    });

    const cutoff = new Date();
    const beforeCutoff = new Date(cutoff.getTime() - 60_000);
    const afterCutoff = new Date(cutoff.getTime() + 60_000);

    await oldDone.updateWithVersion(adminAuth, {
      status: "done",
      doneAt: beforeCutoff,
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
    });
    await newDone.updateWithVersion(adminAuth, {
      status: "done",
      doneAt: afterCutoff,
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
    });
    await otherDone.updateWithVersion(adminAuth, {
      status: "done",
      doneAt: beforeCutoff,
      markedAsDoneByType: "user",
      markedAsDoneByUserId: secondUser.id,
      markedAsDoneByAgentConfigurationId: null,
    });

    await ProjectTodoStateResource.upsertLastCleanedAtBySpace(auth, {
      spaceId: project.id,
      lastCleanedAt: cutoff,
    });

    req.query.spaceId = project.sId;
    req.query.assignee = "all";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    const texts = data.todos.map((t: any) => t.text);

    expect(texts).not.toContain("Old done");
    expect(texts).toContain("New done");
    expect(texts).not.toContain("Other user's done");
  });

  it("should still return pending agent suggestion todos completed before lastCleanedAt", async () => {
    const { user, auth } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const cutoff = new Date();
    const beforeCutoff = new Date(cutoff.getTime() - 60_000);

    const pendingDone = await ProjectTodoFactory.create(workspace, project, {
      userId: user.id,
      text: "Pending approval but done before clean",
    });
    await pendingDone.updateWithVersion(adminAuth, {
      status: "done",
      doneAt: beforeCutoff,
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
      agentSuggestionStatus: "pending",
    });

    const normallyHiddenDone = await ProjectTodoFactory.create(
      workspace,
      project,
      {
        userId: user.id,
        text: "Plain old done before clean",
      }
    );
    await normallyHiddenDone.updateWithVersion(adminAuth, {
      status: "done",
      doneAt: beforeCutoff,
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
    });

    await ProjectTodoStateResource.upsertLastCleanedAtBySpace(auth, {
      spaceId: project.id,
      lastCleanedAt: cutoff,
    });

    req.query.spaceId = project.sId;
    req.query.assignee = "all";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const texts = res._getJSONData().todos.map((t: { text: string }) => t.text);

    expect(texts).toContain("Pending approval but done before clean");
    expect(texts).not.toContain("Plain old done before clean");
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

  it("should create a todo via POST for the authenticated user as assignee", async () => {
    const { user, req, res, workspace } = await setup("POST");
    const project = await SpaceFactory.project(workspace, user.id);

    req.query.spaceId = project.sId;
    req.body = {
      text: "Manual todo from API test",
      assigneeUserId: user.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const data = res._getJSONData();
    expect(data.todo.text).toBe("Manual todo from API test");
    expect(data.todo.user?.sId).toBe(user.sId);
    expect(data.todo.status).toBe("todo");
    expect(data.todo.createdByType).toBe("user");
    expect(data.todo.conversationId).toBeNull();
  });

  it("should return 400 when assignee is not a project member", async () => {
    const { user, req, res, workspace } = await setup("POST");
    const project = await SpaceFactory.project(workspace, user.id);
    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });

    req.query.spaceId = project.sId;
    req.body = {
      text: "Todo for outsider",
      assigneeUserId: outsider.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("member");
  });
});
