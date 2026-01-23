import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADD_PROJECT_FILE_TOOL_NAME,
  LIST_PROJECT_FILES_TOOL_NAME,
  UPDATE_PROJECT_FILE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/project_context_management/file_operations";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentLoopContextFactory } from "@app/tests/utils/AgentLoopContextFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPTestUtils } from "@app/tests/utils/MCPTestUtils";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { WorkspaceType } from "@app/types";

describe("project_context_management - file operations", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  let projectSpace: SpaceResource;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    // Create a project space
    projectSpace = await SpaceFactory.project(workspace);

    // Add user to the space's group for write permissions
    const spaceGroups = await GroupSpaceModel.findAll({
      where: { vaultId: projectSpace.id, workspaceId: workspace.id },
    });
    const user = auth.getNonNullableUser();
    await GroupMembershipModel.create({
      groupId: spaceGroups[0].groupId,
      userId: user.id,
      workspaceId: workspace.id,
      startAt: new Date(),
      status: "active",
    });
  });

  describe("list_project_files tool", () => {
    it("should list all files in project context", async () => {
      // Arrange: Create conversation in project space
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth, {
          agentConfig: { name: "Test Agent" },
        });

      // Update conversation to be in project space
      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create project context file
      const file = await FileFactory.create(workspace, auth.user(), {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: { spaceId: projectSpace.sId },
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: LIST_PROJECT_FILES_TOOL_NAME,
          arguments: {},
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content).toHaveLength(1);
        expect(content[0].text).toContain("test.txt");
        expect(content[0].text).toContain(file.sId);
      } finally {
        await cleanup();
      }
    });

    it("should return message when no files exist", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: LIST_PROJECT_FILES_TOOL_NAME,
          arguments: {},
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("No files are currently");
      } finally {
        await cleanup();
      }
    });

    it("should return error when not in a project", async () => {
      // Arrange: Conversation NOT in a project space
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: LIST_PROJECT_FILES_TOOL_NAME,
          arguments: {},
        });

        // Assert
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("not in a project");
      } finally {
        await cleanup();
      }
    });
  });

  describe("add_project_file tool", () => {
    it("should add file with text content", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Mock file upload
      vi.spyOn(FileResource.prototype, "uploadContent").mockResolvedValue();

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: ADD_PROJECT_FILE_TOOL_NAME,
          arguments: {
            fileName: "new_file.txt",
            content: "Hello, World!",
            contentType: "text/plain",
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("new_file.txt");
        expect(content[0].text).toContain("added to project context");

        // Verify file was created
        const files = await FileResource.listByProject(auth, {
          projectId: projectSpace.sId,
        });
        expect(files.length).toBe(1);
        expect(files[0].fileName).toBe("new_file.txt");
        expect(files[0].contentType).toBe("text/plain");
      } finally {
        await cleanup();
      }
    });

    it("should add file by copying from sourceFileId", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create source file in conversation
      const sourceFile = await FileFactory.create(workspace, auth.user(), {
        contentType: "text/plain",
        fileName: "source.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
      });

      // Mock file copying
      vi.spyOn(FileResource, "copy").mockResolvedValue({
        isOk: () => true,
        value: sourceFile,
      } as any);

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: ADD_PROJECT_FILE_TOOL_NAME,
          arguments: {
            fileName: "copied_file.txt",
            sourceFileId: sourceFile.sId,
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("added to project context");
      } finally {
        await cleanup();
      }
    });

    it("should return error when neither content nor sourceFileId provided", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: ADD_PROJECT_FILE_TOOL_NAME,
          arguments: {
            fileName: "test.txt",
          },
        });

        // Assert
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("content' or 'sourceFileId' must be");
      } finally {
        await cleanup();
      }
    });

    it("should return error when user lacks write permission", async () => {
      // Arrange: Create space without user as member
      const restrictedSpace = await SpaceFactory.project(workspace);

      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, restrictedSpace.id);

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: ADD_PROJECT_FILE_TOOL_NAME,
          arguments: {
            fileName: "test.txt",
            content: "test",
          },
        });

        // Assert
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("write permissions");
      } finally {
        await cleanup();
      }
    });
  });

  describe("update_project_file tool", () => {
    it("should update file content", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create existing file
      const file = await FileFactory.create(workspace, auth.user(), {
        contentType: "text/plain",
        fileName: "existing.txt",
        fileSize: 100,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: { spaceId: projectSpace.sId },
      });

      // Mock file upload
      vi.spyOn(FileResource.prototype, "uploadContent").mockResolvedValue();

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: UPDATE_PROJECT_FILE_TOOL_NAME,
          arguments: {
            fileId: file.sId,
            content: "Updated content",
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("updated successfully");
      } finally {
        await cleanup();
      }
    });

    it("should return error when file not found", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: UPDATE_PROJECT_FILE_TOOL_NAME,
          arguments: {
            fileId: "nonexistent",
            content: "test",
          },
        });

        // Assert
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("File not found");
      } finally {
        await cleanup();
      }
    });

    it("should return error when file not in project context", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create file NOT in project context
      const file = await FileFactory.create(workspace, auth.user(), {
        contentType: "text/plain",
        fileName: "conversation_file.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation", // Different use case
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: UPDATE_PROJECT_FILE_TOOL_NAME,
          arguments: {
            fileId: file.sId,
            content: "test",
          },
        });

        // Assert
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("not found in this project context");
      } finally {
        await cleanup();
      }
    });
  });
});

/**
 * Helper to update conversation space (simulating conversation in project).
 */
async function updateConversationSpace(
  conversationId: number,
  spaceId: number
): Promise<void> {
  const { ConversationModel } = await import(
    "@app/lib/models/agent/conversation"
  );
  await ConversationModel.update(
    { spaceId },
    { where: { id: conversationId } }
  );
}
