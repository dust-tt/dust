import {
  buildTaskUpdatePayload,
  doneAttribution,
  rationaleUpdate,
  statusTransitionUpdates,
} from "@app/lib/api/actions/servers/pod_tasks/tools/index";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ProjectTaskModel } from "@app/lib/resources/storage/models/project_task";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightWorkspaceType } from "@app/types/user";
import type { CreationAttributes } from "sequelize";
import { beforeEach, describe, expect, it } from "vitest";

function makeTodoBlob(
  spaceId: number,
  userId: number,
  overrides: Partial<CreationAttributes<ProjectTaskModel>> = {}
): Omit<CreationAttributes<ProjectTaskModel>, "workspaceId"> {
  return {
    spaceId,
    userId,
    createdByType: "user",
    createdByUserId: userId,
    createdByAgentConfigurationId: null,
    markedAsDoneByType: null,
    markedAsDoneByUserId: null,
    markedAsDoneByAgentConfigurationId: null,
    category: "to_do",
    text: "Test todo",
    status: "todo",
    doneAt: null,
    actorRationale: null,
    agentInstructions: null,
    agentSuggestionStatus: null,
    agentSuggestionReviewedAt: null,
    agentSuggestionReviewedByUserId: null,
    ...overrides,
  };
}

describe("doneAttribution", () => {
  it("returns user attribution when actor is a user", () => {
    expect(doneAttribution("user", 42, "agt_xyz")).toEqual({
      markedAsDoneByType: "user",
      markedAsDoneByUserId: 42,
      markedAsDoneByAgentConfigurationId: null,
    });
  });

  it("returns agent attribution when actor is an agent", () => {
    expect(doneAttribution("agent", 42, "agt_xyz")).toEqual({
      markedAsDoneByType: "agent",
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: "agt_xyz",
    });
  });

  it("records null agentConfigId when actor is an agent with no config", () => {
    expect(doneAttribution("agent", 42, null)).toEqual({
      markedAsDoneByType: "agent",
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: null,
    });
  });
});

describe("statusTransitionUpdates", () => {
  it("sets doneAt and user attribution when transitioning to done", () => {
    const result = statusTransitionUpdates("done", "user", 42, null);
    expect(result.status).toBe("done");
    expect(result.doneAt).toBeInstanceOf(Date);
    expect(result.markedAsDoneByType).toBe("user");
    expect(result.markedAsDoneByUserId).toBe(42);
    expect(result.markedAsDoneByAgentConfigurationId).toBeNull();
  });

  it("sets doneAt and agent attribution when transitioning to done as agent", () => {
    const result = statusTransitionUpdates("done", "agent", 42, "agt_xyz");
    expect(result.markedAsDoneByType).toBe("agent");
    expect(result.markedAsDoneByUserId).toBeNull();
    expect(result.markedAsDoneByAgentConfigurationId).toBe("agt_xyz");
  });

  it("clears doneAt and attribution when transitioning to todo", () => {
    const result = statusTransitionUpdates("todo", "user", 42, null);
    expect(result).toEqual({
      status: "todo",
      doneAt: null,
      markedAsDoneByType: null,
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: null,
    });
  });

  it("clears doneAt and attribution when transitioning to in_progress", () => {
    const result = statusTransitionUpdates("in_progress", "user", 42, null);
    expect(result).toEqual({
      status: "in_progress",
      doneAt: null,
      markedAsDoneByType: null,
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: null,
    });
  });
});

describe("rationaleUpdate", () => {
  it("sets actorRationale when doneRationale is provided", () => {
    expect(
      rationaleUpdate(
        { taskId: "ptd_1", doneRationale: "shipped it" },
        "todo",
        "done"
      )
    ).toEqual({ actorRationale: "shipped it" });
  });

  it("clears actorRationale when transitioning out of done without a rationale", () => {
    expect(rationaleUpdate({ taskId: "ptd_1" }, "done", "todo")).toEqual({
      actorRationale: null,
    });
  });

  it("returns no update when status is unchanged and no rationale is provided", () => {
    expect(rationaleUpdate({ taskId: "ptd_1" }, "todo", "todo")).toEqual({});
    expect(rationaleUpdate({ taskId: "ptd_1" }, "done", "done")).toEqual({});
  });
});

describe("buildTaskUpdatePayload", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let auth: Authenticator;
  let space: SpaceResource;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "user" });
    workspace = setup.workspace;
    user = setup.user;
    auth = setup.authenticator;
    space = setup.globalSpace;
  });

  it("marks a todo as done with user attribution", async () => {
    const row = await ProjectTaskResource.makeNew(
      auth,
      makeTodoBlob(space.id, user.id)
    );

    const result = await buildTaskUpdatePayload(
      auth,
      space,
      row,
      { taskId: row.sId, status: "done", markAsDoneByType: "user" },
      null
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.taskUpdates.status).toBe("done");
    expect(result.value.taskUpdates.doneAt).toBeInstanceOf(Date);
    expect(result.value.taskUpdates.markedAsDoneByType).toBe("user");
    expect(result.value.taskUpdates.markedAsDoneByUserId).toBe(user.id);
    expect(
      result.value.taskUpdates.markedAsDoneByAgentConfigurationId
    ).toBeNull();
  });

  it("marks a todo as done with agent attribution", async () => {
    const row = await ProjectTaskResource.makeNew(
      auth,
      makeTodoBlob(space.id, user.id)
    );

    const result = await buildTaskUpdatePayload(
      auth,
      space,
      row,
      {
        taskId: row.sId,
        doneRationale: "done by the agent",
        markAsDoneByType: "agent",
      },
      "agt_xyz"
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.taskUpdates.status).toBe("done");
    expect(result.value.taskUpdates.markedAsDoneByType).toBe("agent");
    expect(result.value.taskUpdates.markedAsDoneByUserId).toBeNull();
    expect(result.value.taskUpdates.markedAsDoneByAgentConfigurationId).toBe(
      "agt_xyz"
    );
    expect(result.value.taskUpdates.actorRationale).toBe("done by the agent");
  });

  it("defaults to agent attribution when markAsDoneByType is omitted", async () => {
    const row = await ProjectTaskResource.makeNew(
      auth,
      makeTodoBlob(space.id, user.id)
    );

    const result = await buildTaskUpdatePayload(
      auth,
      space,
      row,
      { taskId: row.sId, status: "done" },
      "agt_xyz"
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.taskUpdates.markedAsDoneByType).toBe("agent");
    expect(result.value.taskUpdates.markedAsDoneByUserId).toBeNull();
    expect(result.value.taskUpdates.markedAsDoneByAgentConfigurationId).toBe(
      "agt_xyz"
    );
  });

  it("clears attribution and doneAt when transitioning out of done", async () => {
    const doneAt = new Date();
    const row = await ProjectTaskResource.makeNew(
      auth,
      makeTodoBlob(space.id, user.id, {
        status: "done",
        doneAt,
        actorRationale: "earlier rationale",
        markedAsDoneByType: "user",
        markedAsDoneByUserId: user.id,
      })
    );

    const result = await buildTaskUpdatePayload(
      auth,
      space,
      row,
      { taskId: row.sId, status: "todo" },
      null
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.taskUpdates.status).toBe("todo");
    expect(result.value.taskUpdates.doneAt).toBeNull();
    expect(result.value.taskUpdates.actorRationale).toBeNull();
    expect(result.value.taskUpdates.markedAsDoneByType).toBeNull();
    expect(result.value.taskUpdates.markedAsDoneByUserId).toBeNull();
    expect(
      result.value.taskUpdates.markedAsDoneByAgentConfigurationId
    ).toBeNull();
  });

  it("does not wipe doneAt when editing the text of an already-done task", async () => {
    const doneAt = new Date("2025-01-15T10:00:00Z");
    const row = await ProjectTaskResource.makeNew(
      auth,
      makeTodoBlob(space.id, user.id, {
        status: "done",
        doneAt,
        markedAsDoneByType: "user",
        markedAsDoneByUserId: user.id,
      })
    );

    const result = await buildTaskUpdatePayload(
      auth,
      space,
      row,
      { taskId: row.sId, text: "Updated description goes here." },
      null
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.taskUpdates).not.toHaveProperty("doneAt");
    expect(result.value.taskUpdates).not.toHaveProperty("markedAsDoneByType");
    expect(result.value.taskUpdates).not.toHaveProperty("markedAsDoneByUserId");
    expect(result.value.taskUpdates).not.toHaveProperty("status");
    expect(result.value.taskUpdates.text).toBe(
      "Updated description goes here."
    );
  });

  it("returns no updates when nothing in the item would change", async () => {
    const row = await ProjectTaskResource.makeNew(
      auth,
      makeTodoBlob(space.id, user.id, { status: "done", doneAt: new Date() })
    );

    const result = await buildTaskUpdatePayload(
      auth,
      space,
      row,
      { taskId: row.sId, status: "done" },
      null
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.taskUpdates).toEqual({});
  });

  it("updates actorRationale on an already-done task without re-setting doneAt or attribution", async () => {
    const doneAt = new Date("2025-01-15T10:00:00Z");
    const row = await ProjectTaskResource.makeNew(
      auth,
      makeTodoBlob(space.id, user.id, {
        status: "done",
        doneAt,
        actorRationale: "original",
        markedAsDoneByType: "user",
        markedAsDoneByUserId: user.id,
      })
    );

    const result = await buildTaskUpdatePayload(
      auth,
      space,
      row,
      { taskId: row.sId, doneRationale: "amended rationale" },
      null
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.taskUpdates.actorRationale).toBe("amended rationale");
    expect(result.value.taskUpdates).not.toHaveProperty("doneAt");
    expect(result.value.taskUpdates).not.toHaveProperty("markedAsDoneByType");
    expect(result.value.taskUpdates).not.toHaveProperty("markedAsDoneByUserId");
  });

  it("resolves a valid pod member as the new assignee", async () => {
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });

    const row = await ProjectTaskResource.makeNew(
      auth,
      makeTodoBlob(space.id, user.id)
    );

    const result = await buildTaskUpdatePayload(
      auth,
      space,
      row,
      { taskId: row.sId, assigneeUserId: otherUser.sId },
      null
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.taskUpdates.userId).toBe(otherUser.id);
  });

  // Pods are project spaces — membership is restricted to the project's
  // member groups, unlike the workspace globalSpace which treats every
  // workspace member as a member. Use a project space here so the
  // non-member error path is reachable.
  it("returns an error when assignee is not a member of the pod", async () => {
    const projectSpace = await SpaceFactory.project(workspace, user.id);

    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });

    const row = await ProjectTaskResource.makeNew(
      auth,
      makeTodoBlob(projectSpace.id, user.id)
    );

    const result = await buildTaskUpdatePayload(
      auth,
      projectSpace,
      row,
      { taskId: row.sId, assigneeUserId: outsider.sId },
      null
    );

    expect("error" in result).toBe(true);
    if (!("error" in result)) {
      return;
    }
    expect(result.error).toContain(outsider.sId);
    expect(result.error).toContain(row.sId);
  });
});
