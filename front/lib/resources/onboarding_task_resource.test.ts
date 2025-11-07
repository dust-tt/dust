import { beforeEach, describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { OnboardingTaskResource } from "@app/lib/resources/onboarding_task_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { OnboardingTaskFactory } from "@app/tests/utils/OnboardingTaskFactory";
import type { WorkspaceType } from "@app/types";

describe("OnboardingTaskResource", () => {
  let workspace1: WorkspaceType;
  let workspace2: WorkspaceType;

  let user1: UserResource;
  let user2: UserResource;

  let authU1W1: Authenticator;
  let authU1W2: Authenticator;

  let authU2W1: Authenticator;
  let authU2W2: Authenticator;

  beforeEach(async () => {
    // Create first workspace with user1.
    const testSetup1 = await createResourceTest({ role: "user" });
    workspace1 = testSetup1.workspace;
    user1 = testSetup1.user;
    authU1W1 = testSetup1.authenticator;

    // Create second workspace with user2.
    const testSetup2 = await createResourceTest({ role: "user" });
    workspace2 = testSetup2.workspace;
    user2 = testSetup2.user;
    authU2W2 = testSetup2.authenticator;

    // Create cross-workspace authenticators.
    authU2W1 = await Authenticator.fromUserIdAndWorkspaceId(
      user2.sId,
      workspace1.sId
    );
    authU1W2 = await Authenticator.fromUserIdAndWorkspaceId(
      user1.sId,
      workspace2.sId
    );
  });

  /** *************************************************************
   * Very basic tests first:
   * makeNew and serialization.
   ************************************************************** */
  describe("makeNew", () => {
    it("should create a new onboarding task", async () => {
      const task = await OnboardingTaskResource.makeNew(authU1W1, {
        context: "Soupinou is the best",
        kind: "learning",
      });
      expect(task).toBeDefined();
      expect(task.sId).toMatch(/^obt_/);
      expect(task.workspaceId).toBe(workspace1.id);
      expect(task.userId).toBe(user1.id);
      expect(task.context).toBe("Soupinou is the best");
      expect(task.kind).toBe("learning");
      expect(task.toolName).toBeNull();
      expect(task.completedAt).toBeNull();
      expect(task.skippedAt).toBeNull();
    });
  });

  describe("toJSON", () => {
    it("should serialize task to JSON with correct structure", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1, {
        toolName: "notion",
        kind: "tool_use",
      });
      const json = task.toJSON();
      expect(json).toEqual({
        sId: task.sId,
        context: task.context,
        kind: "tool_use",
        toolName: "notion",
        status: "to_do",
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
    });

    it("should include correct status in JSON", async () => {
      const completedTask = await OnboardingTaskFactory.create(authU1W1, {});
      await completedTask.markCompleted();
      const skippedTask = await OnboardingTaskFactory.create(authU1W1);
      await skippedTask.markSkipped();

      const todoTask = await OnboardingTaskFactory.create(authU1W1);
      expect(completedTask.toJSON().status).toBe("achieved");
      expect(skippedTask.toJSON().status).toBe("skipped");
      expect(todoTask.toJSON().status).toBe("to_do");
    });
  });

  describe("modelIdToSId", () => {
    it("should generate correct sId from model id and workspace id", () => {
      const sId = OnboardingTaskResource.modelIdToSId({
        id: 123,
        workspaceId: 456,
      });
      expect(sId).toMatch(/^obt_/);
    });
  });

  /** *************************************************************
   * Fetch tests:
   * We check that the resource is correctly scoped to the user and workspace.
   ************************************************************** */
  describe("fetchById", () => {
    let task1: OnboardingTaskResource;
    let task2: OnboardingTaskResource;

    beforeEach(async () => {
      // We only create tasks for the first user and workspace.
      task1 = await OnboardingTaskFactory.create(authU1W1);
      task2 = await OnboardingTaskFactory.create(authU1W1);
    });

    it("should fetch task by sId", async () => {
      const fetched = await OnboardingTaskResource.fetchById(
        authU1W1,
        task1.sId
      );
      expect(fetched).toBeDefined();
      expect(fetched?.sId).toBe(task1.sId);
      expect(fetched?.id).toBe(task1.id);
      expect(fetched?.context).toBe(task1.context);
    });

    it("should not fetch task if auth is for a different user", async () => {
      const fetched = await OnboardingTaskResource.fetchById(
        authU2W1,
        task1.sId
      );
      expect(fetched).toBeNull();
    });
    it("should not fetch task if auth is for a different workspace", async () => {
      const fetched = await OnboardingTaskResource.fetchById(
        authU1W2,
        task2.sId
      );
      expect(fetched).toBeNull();
    });

    it("should return null for non-existent sId", async () => {
      const fetched = await OnboardingTaskResource.fetchById(
        authU1W1,
        "obt_soupinou"
      );
      expect(fetched).toBeNull();
    });
  });

  describe("fetchByIds", () => {
    let tasks: OnboardingTaskResource[];

    beforeEach(async () => {
      // We only create tasks for the first user and workspace.
      tasks = await OnboardingTaskFactory.createMultiple(authU1W1, 3);
    });

    it("should fetch multiple tasks by sIds", async () => {
      const sIds = tasks.map((t) => t.sId);
      const fetched = await OnboardingTaskResource.fetchByIds(authU1W1, sIds);
      expect(fetched).toHaveLength(3);
      expect(fetched.map((t) => t.sId).sort()).toEqual(sIds.sort());
    });

    it("should filter out invalid sIds", async () => {
      const sIds = [tasks[0].sId, "obt_soupinou", tasks[1].sId];
      const fetched = await OnboardingTaskResource.fetchByIds(authU1W1, sIds);
      expect(fetched).toHaveLength(2);
      expect(fetched.map((t) => t.sId).sort()).toEqual(
        [tasks[0].sId, tasks[1].sId].sort()
      );
    });

    it("should not fetch tasks from different user", async () => {
      const sIds = tasks.map((t) => t.sId);
      const fetched = await OnboardingTaskResource.fetchByIds(authU2W1, sIds);
      expect(fetched).toHaveLength(0);
    });

    it("should not fetch tasks from different workspace", async () => {
      const sIds = tasks.map((t) => t.sId);
      const fetched = await OnboardingTaskResource.fetchByIds(authU1W2, sIds);
      expect(fetched).toHaveLength(0);
    });
  });

  describe("fetchAll", () => {
    let tasks: OnboardingTaskResource[];
    beforeEach(async () => {
      tasks = await OnboardingTaskFactory.createMultiple(authU1W1, 3);
    });
    it("should fetch all tasks for the user and workspace", async () => {
      const fetched =
        await OnboardingTaskResource.fetchAllForUserAndWorkspaceInAuth(
          authU1W1
        );
      expect(fetched).toHaveLength(3);
      expect(fetched.map((t) => t.sId).sort()).toEqual(
        tasks.map((t) => t.sId).sort()
      );
    });
    it("should not fetch tasks from different user", async () => {
      const fetched =
        await OnboardingTaskResource.fetchAllForUserAndWorkspaceInAuth(
          authU2W1
        );
      expect(fetched).toHaveLength(0);
    });

    it("should not fetch tasks from different workspace", async () => {
      const fetched =
        await OnboardingTaskResource.fetchAllForUserAndWorkspaceInAuth(
          authU1W2
        );
      expect(fetched).toHaveLength(0);
    });
  });

  /** *************************************************************
   * Test around task statuses:
   * We check that the task status is correctly set when marking as completed or skipped.
   * We also check that the status is correctly cleared when marking as completed or skipped.
   ************************************************************** */
  describe("markCompleted", () => {
    it("should mark task as completed", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1);
      expect(task.completedAt).toBeNull();
      const result = await task.markCompleted();
      expect(result.isOk()).toBe(true);
      expect(task.completedAt).toBeDefined();
      expect(task.completedAt).toBeInstanceOf(Date);
      expect(task.skippedAt).toBeNull();
    });

    it("should clear skipped status when marking as completed", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1, {});
      await task.markSkipped();
      expect(task.skippedAt).toBeDefined();
      const result = await task.markCompleted();
      expect(result.isOk()).toBe(true);
      expect(task.completedAt).toBeDefined();
      expect(task.skippedAt).toBeNull();
    });
  });

  describe("markSkipped", () => {
    it("should mark task as skipped", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1);
      expect(task.skippedAt).toBeNull();
      const result = await task.markSkipped();
      expect(result.isOk()).toBe(true);
      expect(task.skippedAt).toBeDefined();
      expect(task.skippedAt).toBeInstanceOf(Date);
      expect(task.completedAt).toBeNull();
    });

    it("should clear completed status when marking as skipped", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1, {});
      expect(task.completedAt).toBeDefined();
      const result = await task.markSkipped();
      expect(result.isOk()).toBe(true);
      expect(task.skippedAt).toBeDefined();
      expect(task.completedAt).toBeNull();
    });
  });

  describe("getStatus", () => {
    it("should return 'to_do' for new tasks", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1);
      expect(task.getStatus()).toBe("to_do");
    });

    it("should return 'achieved' for completed tasks", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1);
      await task.markCompleted();
      expect(task.getStatus()).toBe("achieved");
    });

    it("should return 'skipped' for skipped tasks", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1);
      await task.markSkipped();
      expect(task.getStatus()).toBe("skipped");
    });
  });

  /** *************************************************************
   * Delete tests:
   * We check that the resource is correctly scoped to the user and workspace.
   ************************************************************** */
  describe("delete", () => {
    it("should delete a task", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1);
      const sId = task.sId;
      const result = await task.delete(authU1W1, {});
      expect(result.isOk()).toBe(true);
      const fetched = await OnboardingTaskResource.fetchById(authU1W1, sId);
      expect(fetched).toBeNull();
    });

    it("should not delete task from different user", async () => {
      const task = await OnboardingTaskFactory.create(authU1W1);
      const sId = task.sId;
      const result = await task.delete(authU2W1, {});
      // The delete should succeed (no error) but not actually delete the task.
      expect(result.isOk()).toBe(true);
      const fetched = await OnboardingTaskResource.fetchById(authU1W1, sId);
      expect(fetched).toBeDefined();
      expect(fetched?.sId).toBe(sId);
    });
  });

  describe("deleteAllForUser", () => {
    it("should delete all tasks for a specific user", async () => {
      const task1 = await OnboardingTaskFactory.create(authU1W1);
      const task2 = await OnboardingTaskFactory.create(authU1W1);
      const otherUserTask = await OnboardingTaskFactory.create(authU2W1);

      await OnboardingTaskResource.deleteAllForUser(authU1W1, user1.toJSON());

      // User's tasks should be deleted.
      const fetched1 = await OnboardingTaskResource.fetchById(
        authU1W1,
        task1.sId
      );
      const fetched2 = await OnboardingTaskResource.fetchById(
        authU1W1,
        task2.sId
      );
      expect(fetched1).toBeNull();
      expect(fetched2).toBeNull();

      // Other user's task should still exist.
      const fetchedOther = await OnboardingTaskResource.fetchById(
        authU2W1,
        otherUserTask.sId
      );
      expect(fetchedOther).toBeDefined();
      expect(fetchedOther?.sId).toBe(otherUserTask.sId);
    });
  });

  describe("deleteAllForWorkspace", () => {
    it("should delete all tasks for a workspace", async () => {
      const task1 = await OnboardingTaskFactory.create(authU1W1);
      const task2 = await OnboardingTaskFactory.create(authU1W1);
      const task3 = await OnboardingTaskFactory.create(authU2W1);
      const taskOtherWorkspace = await OnboardingTaskFactory.create(authU2W2);

      await OnboardingTaskResource.deleteAllForWorkspace(authU1W1);

      const fetched1 = await OnboardingTaskResource.fetchById(
        authU1W1,
        task1.sId
      );
      const fetched2 = await OnboardingTaskResource.fetchById(
        authU1W1,
        task2.sId
      );
      const fetched3 = await OnboardingTaskResource.fetchById(
        authU2W1,
        task3.sId
      );
      const fetched4 = await OnboardingTaskResource.fetchById(
        authU2W2,
        taskOtherWorkspace.sId
      );

      expect(fetched1).toBeNull();
      expect(fetched2).toBeNull();
      expect(fetched3).toBeNull();
      expect(fetched4).toBeDefined();
      expect(fetched4?.sId).toBe(taskOtherWorkspace.sId);
    });
  });
});
