import { describe, expect, it, vi } from "vitest";

// postUserMessage starts the agent loop; mock Temporal so the /start tests
// don't hit a real client or leave an unhandled rejection.
vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue({ isOk: () => true }),
  launchCompactionWorkflow: vi.fn().mockResolvedValue({ isOk: () => true }),
}));

import { Authenticator } from "@app/lib/auth";
import { ProjectTaskStateResource } from "@app/lib/resources/project_task_state_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { ProjectTaskFactory } from "@app/tests/utils/ProjectTaskFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

import { honoApp } from "@front-api/app";

function markRead(workspace: { sId: string }, spaceId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_tasks/mark_read`,
    { method: "POST" }
  );
}

function startTask(
  workspace: { sId: string },
  spaceId: string,
  taskId: string,
  body?: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_tasks/${taskId}/start`,
    {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }
  );
}

describe("POST /api/w/:wId/spaces/:spaceId/project_tasks/mark_read", () => {
  it("creates a state row on first call and returns success", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);

    const before = Date.now();
    const response = await markRead(workspace, project.sId);
    const after = Date.now();

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);

    const state = await ProjectTaskStateResource.fetchBySpace(auth, {
      spaceId: project.id,
    });
    expect(state).not.toBeNull();
    expect(state!.lastReadAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(state!.lastReadAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("upserts lastReadAt on subsequent calls without error", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);

    const r1 = await markRead(workspace, project.sId);
    expect(r1.status).toBe(200);

    const firstState = await ProjectTaskStateResource.fetchBySpace(auth, {
      spaceId: project.id,
    });
    const firstReadAt = firstState!.lastReadAt;

    const r2 = await markRead(workspace, project.sId);
    expect(r2.status).toBe(200);

    const updatedState = await ProjectTaskStateResource.fetchBySpace(auth, {
      spaceId: project.id,
    });
    expect(updatedState!.lastReadAt.getTime()).toBeGreaterThanOrEqual(
      firstReadAt.getTime()
    );
  });

  it("returns 400 for non-project spaces", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
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

    const response = await markRead(workspace, regularSpace.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("POST /api/w/:wId/spaces/:spaceId/project_tasks/:taskId/start", () => {
  it("creates and links a conversation for a to_do todo", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Prepare launch checklist",
    });

    const response = await startTask(workspace, project.sId, todo.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task.sId).toBe(todo.sId);
    expect(body.task.status).toBe("in_progress");
    expect(body.task.conversationId).toBeTruthy();
  });

  it("allows starting work on a todo assigned to another project member", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: otherUser.id,
      text: "Prepare roadmap draft",
    });

    const response = await startTask(workspace, project.sId, todo.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task.sId).toBe(todo.sId);
    expect(body.task.status).toBe("in_progress");
    expect(body.task.user?.sId).toBe(otherUser.sId);
    expect(body.task.conversationId).toBeTruthy();
  });

  it("accepts custom start options (message + agent)", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const project = await SpaceFactory.project(workspace, user.id);
    const todo = await ProjectTaskFactory.create(workspace, project, {
      userId: user.id,
      text: "Draft migration checklist",
    });

    const response = await startTask(workspace, project.sId, todo.sId, {
      customMessage: "Focus on safe rollout and rollback plan.",
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task.sId).toBe(todo.sId);
    expect(body.task.status).toBe("in_progress");
  });
});
