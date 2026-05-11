import { Authenticator } from "@app/lib/auth";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { ProjectTaskFactory } from "@app/tests/utils/ProjectTaskFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { WorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import type { MockRequest, MockResponse } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./index";

describe("GET /api/w/[wId]/spaces/[spaceId]/project_tasks", () => {
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
    expect(data.tasks).toEqual([]);
    expect(data.lastReadAt).toBeNull();
  });

  it("should return latest versions of todos for the space", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "First todo",
    });
    // Create a new version of the same todo.
    await todo.updateWithVersion(auth, { text: "Updated todo" });

    req.query.spaceId = project.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { tasks, lastReadAt } = res._getJSONData();
    // Only the latest version should appear.
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe("Updated todo");
    expect(tasks[0].sId).toBe(todo.sId);
    expect(lastReadAt).toBeNull();
  });

  it("should return all assignees todos with user metadata when assignee=all", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const secondUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, secondUser, { role: "user" });

    await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "My todo",
    });
    await ProjectTaskFactory.create(workspace, project, {
      userId: secondUser.id,
      text: "Other user todo",
    });

    req.query.spaceId = project.sId;
    req.query.assignee = "all";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.tasks).toHaveLength(2);
    expect(data.viewerUserId).toBe(user.sId);
    expect(data.tasks[0].user).not.toBeNull();
    expect(data.tasks[1].user).not.toBeNull();
  });

  it("should return only todos assigned to the viewer when assignee=mine", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const secondUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, secondUser, { role: "user" });

    await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Mine only",
    });
    await ProjectTaskFactory.create(workspace, project, {
      userId: secondUser.id,
      text: "Not mine",
    });

    req.query.spaceId = project.sId;
    req.query.assignee = "mine";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const texts = res._getJSONData().tasks.map((t: { text: string }) => t.text);
    expect(texts.sort()).toEqual(["Mine only"]);
  });

  it("should return only todos completed within the window when period=last_24h", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const recentlyDone = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Recently done",
    });
    await recentlyDone.updateWithVersion(adminAuth, {
      status: "done",
      doneAt: new Date(Date.now() - 60 * 60 * 1000),
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
    });

    const oldDone = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Done long ago",
    });
    await oldDone.updateWithVersion(adminAuth, {
      status: "done",
      doneAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
    });

    await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Still open",
    });

    req.query.spaceId = project.sId;
    req.query.period = "last_24h";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const texts = res._getJSONData().tasks.map((t: { text: string }) => t.text);
    expect(texts).toContain("Recently done");
    expect(texts).not.toContain("Done long ago");
    expect(texts).not.toContain("Still open");
  });

  it("should hide done todos in the active view for all users", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const secondUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, secondUser, { role: "user" });

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const myDone = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "My done",
    });
    const otherDone = await ProjectTaskFactory.create(workspace, project, {
      userId: secondUser.id,
      text: "Other user's done",
    });
    await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "My open",
    });

    await myDone.updateWithVersion(adminAuth, {
      status: "done",
      doneAt: new Date(),
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
    });
    await otherDone.updateWithVersion(adminAuth, {
      status: "done",
      doneAt: new Date(),
      markedAsDoneByType: "user",
      markedAsDoneByUserId: secondUser.id,
      markedAsDoneByAgentConfigurationId: null,
    });

    req.query.spaceId = project.sId;
    req.query.assignee = "all";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    const texts = data.tasks.map((t: any) => t.text);

    expect(texts).not.toContain("My done");
    expect(texts).not.toContain("Other user's done");
    expect(texts).toContain("My open");
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
    expect(data.task.text).toBe("Manual todo from API test");
    expect(data.task.user?.sId).toBe(user.sId);
    expect(data.task.status).toBe("todo");
    expect(data.task.createdByType).toBe("user");
    expect(data.task.conversationId).toBeNull();
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

  it("should assign the sole assignable member when assigneeUserId is null", async () => {
    const { user, req, res, workspace } = await setup("POST");
    const project = await SpaceFactory.project(workspace, user.id);

    req.query.spaceId = project.sId;
    req.body = {
      text: "Sole assignable member default",
      assigneeUserId: null,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const data = res._getJSONData();
    expect(data.task.user?.sId).toBe(user.sId);
  });

  it("should leave task unassigned when assigneeUserId is null with multiple assignable members", async () => {
    const { user, req, res, workspace } = await setup("POST");
    const project = await SpaceFactory.project(workspace, user.id);

    const secondUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, secondUser, { role: "user" });

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const memberGroup = project.groups.find((g) => g.kind === "regular");
    expect(memberGroup).toBeDefined();

    const addRes = await memberGroup!.dangerouslyAddMember(adminAuth, {
      user: secondUser.toJSON(),
    });
    expect(addRes.isOk()).toBe(true);

    req.query.spaceId = project.sId;
    req.body = {
      text: "Null assignee stays unassigned with two members",
      assigneeUserId: null,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(res._getJSONData().task.user).toBeNull();
  });
});
