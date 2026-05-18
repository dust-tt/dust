import { resolveMountPoint } from "@app/lib/api/actions/servers/files/tools/utils";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

describe("resolveMountPoint", () => {
  describe("conversation paths", () => {
    it("returns the conversation mount with the correct prefix", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const result = await resolveMountPoint(auth, conversation, {
        access: "read",
        scopedPath: "conversation/notes.md",
      });

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.scope).toEqual({
        useCase: "conversation",
        conversationId: conversation.sId,
      });
      expect(result.value.prefix).toBe(
        `w/${workspace.sId}/conversations/${conversation.sId}/files/`
      );
    });

    it("returns the conversation mount on a write access request too", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const result = await resolveMountPoint(auth, conversation, {
        access: "write",
        scopedPath: "conversation/folder/sub/output.csv",
      });

      expect(result.isOk()).toBe(true);
    });
  });

  describe("project paths", () => {
    it("returns the project mount for a project conversation", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const userId = auth.getNonNullableUser().id;
      const userSId = auth.getNonNullableUser().sId;

      const space = await SpaceFactory.project(workspace, userId);
      const addRes = await space.addMembers(auth, { userIds: [userSId] });
      assert(addRes.isOk(), "Failed to add user to project space");

      // Refresh the auth so the new space membership is picked up.
      const projectAuth = await Authenticator.fromUserIdAndWorkspaceId(
        userSId,
        workspace.sId
      );

      const conversation = await createConversation(projectAuth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: space.id,
      });

      const result = await resolveMountPoint(projectAuth, conversation, {
        access: "read",
        scopedPath: "project/spec.md",
      });

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.scope).toEqual({
        useCase: "project",
        projectId: space.sId,
      });
      expect(result.value.prefix).toBe(
        `w/${workspace.sId}/projects/${space.sId}/files/`
      );
    });

    it("returns Err for a project path in a non-project conversation", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const result = await resolveMountPoint(auth, conversation, {
        access: "read",
        scopedPath: "project/spec.md",
      });

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toContain("project conversations");
    });
  });

  describe("invalid paths", () => {
    it("returns Err for a path without a known scope prefix", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const result = await resolveMountPoint(auth, conversation, {
        access: "read",
        scopedPath: "other/foo.txt",
      });

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) {
        return;
      }
      expect(result.error.message).toContain("must start with");
    });

    it("returns Err for a path without a slash", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const conversation = await createConversation(auth, {
        title: "Test",
        visibility: "unlisted",
        spaceId: null,
      });

      const result = await resolveMountPoint(auth, conversation, {
        access: "read",
        scopedPath: "conversation",
      });

      expect(result.isErr()).toBe(true);
    });
  });
});
