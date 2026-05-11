import { Authenticator } from "@app/lib/auth";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { ProjectTaskFactory } from "@app/tests/utils/ProjectTaskFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { WorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import type { MockRequest, MockResponse } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./bulk-actions";

describe("POST /api/w/[wId]/spaces/[spaceId]/project_tasks/bulk-actions", () => {
  let req: MockRequest<NextApiRequest>;
  let res: MockResponse<NextApiResponse>;
  let workspace: WorkspaceType;

  async function setup(method = "POST") {
    const result = await createPrivateApiMockRequest({ method: method as any });
    req = result.req;
    res = result.res;
    workspace = result.workspace;
    return result;
  }

  it("should mark all provided todos as done", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo1 = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    const todo2 = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });

    req.query.spaceId = project.sId;
    req.body = {
      action: "set_status",
      taskIds: [todo1.sId, todo2.sId],
      status: "done",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const refreshed1 = await ProjectTaskResource.fetchBySId(auth, todo1.sId);
    const refreshed2 = await ProjectTaskResource.fetchBySId(auth, todo2.sId);
    expect(refreshed1?.status).toBe("done");
    expect(refreshed1?.markedAsDoneByType).toBe("user");
    expect(refreshed1?.doneAt).not.toBeNull();
    expect(refreshed2?.status).toBe("done");
  });

  it("should clear done metadata when flipping back to todo", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    await todo.updateWithVersion(auth, {
      status: "done",
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
      doneAt: new Date(),
    });

    req.query.spaceId = project.sId;
    req.body = {
      action: "set_status",
      taskIds: [todo.sId],
      status: "todo",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const refreshed = await ProjectTaskResource.fetchBySId(auth, todo.sId);
    expect(refreshed?.status).toBe("todo");
    expect(refreshed?.markedAsDoneByType).toBeNull();
    expect(refreshed?.doneAt).toBeNull();
  });

  it("should reject todos that belong to a different space", async () => {
    const { user } = await setup();
    const project1 = await SpaceFactory.project(workspace, user.id);
    const project2 = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project1, {
      userId: user.id,
    });

    req.query.spaceId = project2.sId;
    req.body = {
      action: "set_status",
      taskIds: [todo.sId],
      status: "done",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("should allow bulk status updates for todos assigned to other project members", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });

    const myTodo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    const otherTodo = await ProjectTaskFactory.create(workspace, project, {
      userId: otherUser.id,
    });

    req.query.spaceId = project.sId;
    req.body = {
      action: "set_status",
      taskIds: [myTodo.sId, otherTodo.sId],
      status: "done",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const refreshedMyTodo = await ProjectTaskResource.fetchBySId(
      auth,
      myTodo.sId
    );
    const refreshedOtherTodo = await ProjectTaskResource.fetchBySId(
      auth,
      otherTodo.sId
    );
    expect(refreshedMyTodo?.status).toBe("done");
    expect(refreshedOtherTodo?.status).toBe("done");
  });

  it("should approve pending agent suggestions in the space", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    await todo.updateWithVersion(auth, {
      agentSuggestionStatus: "pending",
    });

    req.query.spaceId = project.sId;
    req.body = {
      action: "approve_agent_suggestion",
      taskIds: [todo.sId],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    const refreshed = await ProjectTaskResource.fetchBySId(auth, todo.sId);
    expect(refreshed?.agentSuggestionStatus).toBe("approved");
    expect(refreshed?.agentSuggestionReviewedAt).not.toBeNull();
    expect(refreshed?.agentSuggestionReviewedByUserId).toBe(user.id);
  });

  it("should reject pending agent suggestions and soft-delete", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    await todo.updateWithVersion(auth, {
      agentSuggestionStatus: "pending",
    });

    req.query.spaceId = project.sId;
    req.body = {
      action: "reject_agent_suggestion",
      taskIds: [todo.sId],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    const refreshed = await ProjectTaskResource.fetchBySIdWithDeleted(
      auth,
      todo.sId
    );
    expect(refreshed?.agentSuggestionStatus).toBe("rejected");
    expect(refreshed?.deletedAt).not.toBeNull();
    expect(refreshed?.agentSuggestionReviewedByUserId).toBe(user.id);
  });

  it("should return 400 when the body is invalid", async () => {
    const { user } = await setup();
    const project = await SpaceFactory.project(workspace, user.id);

    req.query.spaceId = project.sId;
    req.body = { action: "set_status", taskIds: [], status: "done" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("should return 405 for unsupported methods", async () => {
    const { user } = await setup("GET");
    const project = await SpaceFactory.project(workspace, user.id);
    req.query.spaceId = project.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
