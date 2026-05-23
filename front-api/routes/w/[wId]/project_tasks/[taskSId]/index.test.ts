import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ProjectTaskFactory } from "@app/tests/utils/ProjectTaskFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function taskUrl(wId: string, taskSId: string) {
  return `/api/w/${wId}/project_tasks/${taskSId}`;
}

describe("GET /api/w/[wId]/project_tasks/[taskSId]", () => {
  it("returns the todo and project space id", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Ship the feature",
    });

    const response = await honoApp.request(taskUrl(workspace.sId, todo.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.space.sId).toBe(project.sId);
    expect(body.space.kind).toBe("project");
    expect(body.space.name).toBe(project.name);
    expect(body.task.sId).toBe(todo.sId);
    expect(body.task.text).toBe("Ship the feature");
    expect(body.task.sources).toEqual([]);
  });

  it("returns 404 for an unknown todo sId", async () => {
    const { workspace } = await createPrivateApiMockRequest({ method: "GET" });

    const response = await honoApp.request(
      taskUrl(workspace.sId, "nonexistent_todo_sid")
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("project_task_not_found");
  });

  it("returns 404 for unsupported methods", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
    });

    const response = await honoApp.request(taskUrl(workspace.sId, todo.sId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
  });
});
