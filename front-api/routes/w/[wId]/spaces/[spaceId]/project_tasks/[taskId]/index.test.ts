import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { ProjectTaskFactory } from "@app/tests/utils/ProjectTaskFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function patchTask(
  workspace: { sId: string },
  spaceId: string,
  taskId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_tasks/${taskId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function deleteTask(
  workspace: { sId: string },
  spaceId: string,
  taskId: string
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_tasks/${taskId}`,
    { method: "DELETE" }
  );
}

describe("PATCH /api/w/:wId/spaces/:spaceId/project_tasks/:taskId", () => {
  it("edits the text of a todo", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Original text",
    });

    const response = await patchTask(workspace, project.sId, todo.sId, {
      text: "Updated text",
    });

    expect(response.status).toBe(200);
    const { task: updated } = await response.json();
    expect(updated.text).toBe("Updated text");
    expect(updated.sId).toBe(todo.sId);
  });

  it("marks a todo as done", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });

    const response = await patchTask(workspace, project.sId, todo.sId, {
      status: "done",
    });

    expect(response.status).toBe(200);
    const { task: updated } = await response.json();
    expect(updated.status).toBe("done");
    expect(updated.markedAsDoneByType).toBe("user");
    expect(updated.doneAt).not.toBeNull();
  });

  it("allows un-marking a done todo", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });
    const doneTodo = await todo.updateWithVersion(auth, {
      status: "done",
      markedAsDoneByType: "user",
      markedAsDoneByUserId: user.id,
      markedAsDoneByAgentConfigurationId: null,
      doneAt: new Date(),
    });

    const response = await patchTask(workspace, project.sId, doneTodo.sId, {
      status: "todo",
    });

    expect(response.status).toBe(200);
    const { task: updated } = await response.json();
    expect(updated.status).toBe("todo");
    expect(updated.markedAsDoneByType).toBeNull();
    expect(updated.doneAt).toBeNull();
  });

  it("returns 404 for a non-existent todo", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);

    const response = await patchTask(
      workspace,
      project.sId,
      "nonexistent_todo_sid",
      { text: "Update" }
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("project_task_not_found");
  });

  it("returns 404 for a todo that belongs to a different space", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project1 = await SpaceFactory.project(workspace, user.id);
    const project2 = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project1, {
      userId: user.id,
    });

    const response = await patchTask(workspace, project2.sId, todo.sId, {
      text: "Update",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("project_task_not_found");
  });

  it("allows updating a todo assigned to another project member", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherTodo = await ProjectTaskFactory.create(workspace, project, {
      userId: otherUser.id,
      text: "Other member todo",
    });

    const response = await patchTask(workspace, project.sId, otherTodo.sId, {
      text: "Edited by project member",
      status: "done",
    });

    expect(response.status).toBe(200);
    const { task: updated } = await response.json();
    expect(updated.text).toBe("Edited by project member");
    expect(updated.status).toBe("done");
    expect(updated.user?.sId).toBe(otherUser.sId);
  });

  it("reassigns a todo to another project member", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const memberGroup =
      project.groups.find((g) => g.kind === "regular") ?? project.groups[0]!;
    await GroupFactory.withMembers(adminAuth, memberGroup, [otherUser]);

    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Hand off this",
    });

    const response = await patchTask(workspace, project.sId, todo.sId, {
      assigneeUserId: otherUser.sId,
    });

    expect(response.status).toBe(200);
    const { task: updated } = await response.json();
    expect(updated.user?.sId).toBe(otherUser.sId);
    expect(updated.text).toBe("Hand off this");
  });

  it("clears a todo assignee when assigneeUserId is null", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Unassign me",
    });

    const response = await patchTask(workspace, project.sId, todo.sId, {
      assigneeUserId: null,
    });

    expect(response.status).toBe(200);
    const { task: updated } = await response.json();
    expect(updated.user).toBeNull();
    expect(updated.text).toBe("Unassign me");
  });

  it("returns 400 when no update fields are provided", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });

    const response = await patchTask(workspace, project.sId, todo.sId, {});

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("DELETE /api/w/:wId/spaces/:spaceId/project_tasks/:taskId", () => {
  it("soft-deletes the todo and returns 204", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });

    const response = await deleteTask(workspace, project.sId, todo.sId);

    expect(response.status).toBe(204);
  });
});
