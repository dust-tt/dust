import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { ProjectTaskFactory } from "@app/tests/utils/ProjectTaskFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import { honoApp } from "@front-api/app";

function bulkActions(
  workspace: { sId: string },
  spaceId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_tasks/bulk-actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/spaces/:spaceId/project_tasks/bulk-actions", () => {
  it("marks all provided todos as done", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo1 = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    const todo2 = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });

    const response = await bulkActions(workspace, project.sId, {
      action: "set_status",
      taskIds: [todo1.sId, todo2.sId],
      status: "done",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const refreshed1 = await ProjectTaskResource.fetchBySId(auth, todo1.sId);
    const refreshed2 = await ProjectTaskResource.fetchBySId(auth, todo2.sId);
    expect(refreshed1?.status).toBe("done");
    expect(refreshed1?.markedAsDoneByType).toBe("user");
    expect(refreshed1?.doneAt).not.toBeNull();
    expect(refreshed2?.status).toBe("done");
  });

  it("clears done metadata when flipping back to todo", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
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

    const response = await bulkActions(workspace, project.sId, {
      action: "set_status",
      taskIds: [todo.sId],
      status: "todo",
    });

    expect(response.status).toBe(200);
    const refreshed = await ProjectTaskResource.fetchBySId(auth, todo.sId);
    expect(refreshed?.status).toBe("todo");
    expect(refreshed?.markedAsDoneByType).toBeNull();
    expect(refreshed?.doneAt).toBeNull();
  });

  it("rejects todos that belong to a different space", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project1 = await SpaceFactory.project(workspace, user.id);
    const project2 = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project1, {
      userId: user.id,
    });

    const response = await bulkActions(workspace, project2.sId, {
      action: "set_status",
      taskIds: [todo.sId],
      status: "done",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("allows bulk status updates for todos assigned to other project members", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });

    const myTodo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    const otherTodo = await ProjectTaskFactory.create(workspace, project, {
      userId: otherUser.id,
    });

    const response = await bulkActions(workspace, project.sId, {
      action: "set_status",
      taskIds: [myTodo.sId, otherTodo.sId],
      status: "done",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

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

  it("approves pending agent suggestions in the space", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    await todo.updateWithVersion(auth, {
      agentSuggestionStatus: "pending",
    });

    const response = await bulkActions(workspace, project.sId, {
      action: "approve_agent_suggestion",
      taskIds: [todo.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const refreshed = await ProjectTaskResource.fetchBySId(auth, todo.sId);
    expect(refreshed?.agentSuggestionStatus).toBe("approved");
    expect(refreshed?.agentSuggestionReviewedAt).not.toBeNull();
    expect(refreshed?.agentSuggestionReviewedByUserId).toBe(user.id);
  });

  it("rejects pending agent suggestions and soft-deletes", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    await todo.updateWithVersion(auth, {
      agentSuggestionStatus: "pending",
    });

    const response = await bulkActions(workspace, project.sId, {
      action: "reject_agent_suggestion",
      taskIds: [todo.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const refreshed = await ProjectTaskResource.fetchBySIdWithDeleted(
      auth,
      todo.sId
    );
    expect(refreshed?.agentSuggestionStatus).toBe("rejected");
    expect(refreshed?.deletedAt).not.toBeNull();
    expect(refreshed?.agentSuggestionReviewedByUserId).toBe(user.id);
  });

  it("returns 400 when the body is invalid", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);

    const response = await bulkActions(workspace, project.sId, {
      action: "set_status",
      taskIds: [],
      status: "done",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});
