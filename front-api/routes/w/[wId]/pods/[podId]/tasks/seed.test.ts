import { Authenticator } from "@app/lib/auth";
import { INITIAL_POD_TASKS } from "@app/lib/project_task/initial_project_tasks";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function seedInitialTasks(workspace: { sId: string }, podId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/pods/${podId}/tasks/seed`, {
    method: "POST",
  });
}

describe("POST /api/w/:wId/pods/:podId/tasks/seed", () => {
  it("creates the starter tasks for project editors", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const project = await SpaceFactory.project(workspace, user.id);

    const response = await seedInitialTasks(workspace, project.sId);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.tasks).toHaveLength(INITIAL_POD_TASKS.length);
    expect(body.tasks.map((task: { text: string }) => task.text)).toEqual(
      INITIAL_POD_TASKS.map((seed) => seed.text)
    );
  });

  it("returns 409 when initial tasks were already seeded", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const project = await SpaceFactory.project(workspace, user.id);

    const first = await seedInitialTasks(workspace, project.sId);
    expect(first.status).toBe(201);

    const second = await seedInitialTasks(workspace, project.sId);
    expect(second.status).toBe(409);
    expect((await second.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 for non-editor project members", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const project = await SpaceFactory.project(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const [spaceGroup] = project.groups.filter((g) => !g.isGlobal());
    await spaceGroup.dangerouslyAddMembers(adminAuth, {
      users: [user.toJSON()],
    });

    const response = await seedInitialTasks(workspace, project.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("space_not_found");
  });

  it("returns 400 for non-project spaces", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });
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

    const response = await seedInitialTasks(workspace, regularSpace.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});
