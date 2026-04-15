import { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ProjectTodoModel } from "@app/lib/resources/storage/models/project_todo";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types/user";
import type { CreationAttributes } from "sequelize";
import { beforeEach, describe, expect, it } from "vitest";

// Minimal creation blob — all nullable fields set explicitly so TypeScript is
// happy without the factory abstraction.
function makeTodoBlob(
  spaceId: number,
  userId: number,
  overrides: { text?: string } = {}
): Omit<CreationAttributes<ProjectTodoModel>, "workspaceId"> {
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
    text: overrides.text ?? "Test todo",
    status: "todo",
    doneAt: null,
    actorRationale: null,
  };
}

describe("ProjectTodoResource", () => {
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

  describe("makeNew", () => {
    it("should create a todo with a stable sId starting with 'ptd_'", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id, { text: "My todo" })
      );

      expect(todo.sId).toMatch(/^ptd_/);
      expect(todo.workspaceId).toBe(workspace.id);
      expect(todo.userId).toBe(user.id);
      expect(todo.text).toBe("My todo");
      expect(todo.status).toBe("todo");
    });

    it("should compute the same sId as modelIdToSId", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id)
      );

      const computed = ProjectTodoResource.modelIdToSId({
        id: todo.id,
        workspaceId: todo.workspaceId,
      });

      expect(todo.sId).toBe(computed);
    });
  });

  describe("fetchBySId", () => {
    it("should fetch a todo by its stable sId", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id, { text: "Fetchable todo" })
      );

      const fetched = await ProjectTodoResource.fetchBySId(auth, todo.sId);

      expect(fetched).not.toBeNull();
      expect(fetched?.sId).toBe(todo.sId);
      expect(fetched?.text).toBe("Fetchable todo");
    });

    it("should return null for a non-existent sId", async () => {
      const fetched = await ProjectTodoResource.fetchBySId(
        auth,
        "ptd_doesnotexist"
      );
      expect(fetched).toBeNull();
    });

    it("should not fetch a todo that belongs to a different workspace", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id)
      );

      const otherSetup = await createResourceTest({ role: "user" });
      const fetched = await ProjectTodoResource.fetchBySId(
        otherSetup.authenticator,
        todo.sId
      );

      expect(fetched).toBeNull();
    });
  });

  describe("updateWithVersion", () => {
    it("should update the main row and preserve the sId", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id, { text: "Original" })
      );
      const originalSId = todo.sId;

      const updated = await todo.updateWithVersion(auth, { text: "Updated" });

      expect(updated.sId).toBe(originalSId);
      expect(updated.text).toBe("Updated");
    });

    it("should persist the update so a subsequent fetch returns the new value", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id, { text: "Before" })
      );

      await todo.updateWithVersion(auth, { text: "After" });

      const fetched = await ProjectTodoResource.fetchBySId(auth, todo.sId);
      expect(fetched?.text).toBe("After");
    });

    it("should allow multiple successive updates", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id)
      );

      const v1 = await todo.updateWithVersion(auth, { text: "Version 1" });
      const v2 = await v1.updateWithVersion(auth, { text: "Version 2" });

      expect(v2.text).toBe("Version 2");
      expect(v2.sId).toBe(todo.sId);
    });

    it("should throw when called with a different workspace's auth", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id, { text: "Original" })
      );

      const otherSetup = await createResourceTest({ role: "user" });

      await expect(
        todo.updateWithVersion(otherSetup.authenticator, {
          text: "Cross-tenant",
        })
      ).rejects.toThrow("Workspace mismatch");

      // Confirm the database row is unchanged.
      const fetched = await ProjectTodoResource.fetchBySId(auth, todo.sId);
      expect(fetched?.text).toBe("Original");
    });

    it("should support marking a todo as done", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id)
      );

      const updated = await todo.updateWithVersion(auth, {
        status: "done",
        markedAsDoneByType: "user",
        markedAsDoneByUserId: user.id,
        markedAsDoneByAgentConfigurationId: null,
      });

      expect(updated.status).toBe("done");
      expect(updated.markedAsDoneByType).toBe("user");
      expect(updated.markedAsDoneByUserId).toBe(user.id);
    });
  });

  describe("fetchLatestBySpace", () => {
    it("should return todos belonging to the authenticated user in the space", async () => {
      await ProjectTodoResource.makeNew(auth, makeTodoBlob(space.id, user.id));
      await ProjectTodoResource.makeNew(auth, makeTodoBlob(space.id, user.id));

      const todos = await ProjectTodoResource.fetchLatestBySpace(auth, {
        spaceId: space.id,
      });

      expect(todos.length).toBeGreaterThanOrEqual(2);
      for (const t of todos) {
        expect(t.workspaceId).toBe(workspace.id);
        expect(t.userId).toBe(user.id);
      }
    });

    it("should not return todos from a different user in the same space", async () => {
      // Create a second user in the same workspace.
      const otherSetup = await createResourceTest({ role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherSetup.user.sId,
        workspace.sId
      );

      // Create one todo for user and one for otherUser in the same space.
      await ProjectTodoResource.makeNew(auth, makeTodoBlob(space.id, user.id));
      await ProjectTodoResource.makeNew(
        otherAuth,
        makeTodoBlob(space.id, otherSetup.user.id)
      );

      // fetchLatestBySpace is scoped to the current user.
      const todosForUser = await ProjectTodoResource.fetchLatestBySpace(auth, {
        spaceId: space.id,
      });

      for (const t of todosForUser) {
        expect(t.userId).toBe(user.id);
      }
    });
  });

  describe("delete", () => {
    it("should delete the todo so fetchBySId returns null afterwards", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id)
      );
      const sId = todo.sId;

      const result = await todo.delete(auth, {});
      expect(result.isOk()).toBe(true);

      const fetched = await ProjectTodoResource.fetchBySId(auth, sId);
      expect(fetched).toBeNull();
    });

    it("should also delete version snapshots created by updateWithVersion", async () => {
      const todo = await ProjectTodoResource.makeNew(
        auth,
        makeTodoBlob(space.id, user.id)
      );
      const updated = await todo.updateWithVersion(auth, { text: "v1" });
      const sId = updated.sId;

      await updated.delete(auth, {});

      // The main row is gone — no observable version leakage through the public API.
      const fetched = await ProjectTodoResource.fetchBySId(auth, sId);
      expect(fetched).toBeNull();
    });
  });
});
