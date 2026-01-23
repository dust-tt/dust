import { beforeEach, describe, expect, it } from "vitest";

import {
  ADD_PROJECT_URL_TOOL_NAME,
  EDIT_PROJECT_DESCRIPTION_TOOL_NAME,
  EDIT_PROJECT_URL_TOOL_NAME,
  READ_PROJECT_JOURNAL_ENTRY_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/project_context_management/metadata_operations";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentLoopContextFactory } from "@app/tests/utils/AgentLoopContextFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPTestUtils } from "@app/tests/utils/MCPTestUtils";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { WorkspaceType } from "@app/types";

describe("project_context_management - metadata operations", () => {
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

  describe("edit_project_description tool", () => {
    it("should create and set project description when no metadata exists", async () => {
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
          name: EDIT_PROJECT_DESCRIPTION_TOOL_NAME,
          arguments: {
            description: "This is a test project for unit testing",
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("updated successfully");

        // Verify metadata was created
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          projectSpace
        );
        expect(metadata).not.toBeNull();
        expect(metadata?.description).toBe(
          "This is a test project for unit testing"
        );
      } finally {
        await cleanup();
      }
    });

    it("should update existing project description", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create initial metadata
      await ProjectMetadataResource.makeNew(auth, projectSpace, {
        description: "Initial description",
        urls: [],
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: EDIT_PROJECT_DESCRIPTION_TOOL_NAME,
          arguments: {
            description: "Updated description",
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("updated successfully");

        // Verify metadata was updated
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          projectSpace
        );
        expect(metadata?.description).toBe("Updated description");
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
          name: EDIT_PROJECT_DESCRIPTION_TOOL_NAME,
          arguments: {
            description: "Test",
          },
        });

        // Assert
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("not in a project");
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
          name: EDIT_PROJECT_DESCRIPTION_TOOL_NAME,
          arguments: {
            description: "Test",
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

  describe("add_project_url tool", () => {
    it("should add URL to project metadata", async () => {
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
          name: ADD_PROJECT_URL_TOOL_NAME,
          arguments: {
            name: "Documentation",
            url: "https://docs.example.com",
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("added to project successfully");

        // Verify URL was added
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          projectSpace
        );
        expect(metadata?.urls).toHaveLength(1);
        expect(metadata?.urls[0]).toEqual({
          name: "Documentation",
          url: "https://docs.example.com",
        });
      } finally {
        await cleanup();
      }
    });

    it("should add URL to existing URLs", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create initial metadata with one URL
      await ProjectMetadataResource.makeNew(auth, projectSpace, {
        description: null,
        urls: [{ name: "GitHub", url: "https://github.com/example" }],
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: ADD_PROJECT_URL_TOOL_NAME,
          arguments: {
            name: "Documentation",
            url: "https://docs.example.com",
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("added to project successfully");

        // Verify URL was added to existing list
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          projectSpace
        );
        expect(metadata?.urls).toHaveLength(2);
        expect(metadata?.urls).toContainEqual({
          name: "GitHub",
          url: "https://github.com/example",
        });
        expect(metadata?.urls).toContainEqual({
          name: "Documentation",
          url: "https://docs.example.com",
        });
      } finally {
        await cleanup();
      }
    });

    it("should return error when not in a project", async () => {
      // Arrange
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
          name: ADD_PROJECT_URL_TOOL_NAME,
          arguments: {
            name: "Test",
            url: "https://example.com",
          },
        });

        // Assert
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("not in a project");
      } finally {
        await cleanup();
      }
    });
  });

  describe("edit_project_url tool", () => {
    it("should update URL name", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create metadata with URL
      await ProjectMetadataResource.makeNew(auth, projectSpace, {
        description: null,
        urls: [{ name: "GitHub", url: "https://github.com/example" }],
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: EDIT_PROJECT_URL_TOOL_NAME,
          arguments: {
            currentName: "GitHub",
            newName: "Repository",
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("updated successfully");

        // Verify URL name was updated
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          projectSpace
        );
        expect(metadata?.urls).toHaveLength(1);
        expect(metadata?.urls[0].name).toBe("Repository");
        expect(metadata?.urls[0].url).toBe("https://github.com/example");
      } finally {
        await cleanup();
      }
    });

    it("should update URL value", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create metadata with URL
      await ProjectMetadataResource.makeNew(auth, projectSpace, {
        description: null,
        urls: [{ name: "GitHub", url: "https://github.com/old" }],
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: EDIT_PROJECT_URL_TOOL_NAME,
          arguments: {
            currentName: "GitHub",
            newUrl: "https://github.com/new",
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("updated successfully");

        // Verify URL value was updated
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          projectSpace
        );
        expect(metadata?.urls[0].url).toBe("https://github.com/new");
      } finally {
        await cleanup();
      }
    });

    it("should update both name and URL", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create metadata with URL
      await ProjectMetadataResource.makeNew(auth, projectSpace, {
        description: null,
        urls: [{ name: "GitHub", url: "https://github.com/old" }],
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: EDIT_PROJECT_URL_TOOL_NAME,
          arguments: {
            currentName: "GitHub",
            newName: "Repository",
            newUrl: "https://github.com/new",
          },
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("updated successfully");

        // Verify both were updated
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          projectSpace
        );
        expect(metadata?.urls[0]).toEqual({
          name: "Repository",
          url: "https://github.com/new",
        });
      } finally {
        await cleanup();
      }
    });

    it("should return error when URL not found", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create metadata without URLs
      await ProjectMetadataResource.makeNew(auth, projectSpace, {
        description: null,
        urls: [],
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: EDIT_PROJECT_URL_TOOL_NAME,
          arguments: {
            currentName: "NonExistent",
            newName: "Test",
          },
        });

        // Assert
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("not found");
      } finally {
        await cleanup();
      }
    });

    it("should return error when neither newName nor newUrl provided", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create metadata with URL
      await ProjectMetadataResource.makeNew(auth, projectSpace, {
        description: null,
        urls: [{ name: "GitHub", url: "https://github.com/example" }],
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: EDIT_PROJECT_URL_TOOL_NAME,
          arguments: {
            currentName: "GitHub",
          },
        });

        // Assert
        const errorMessage = MCPTestUtils.assertToolError(result);
        expect(errorMessage).toContain("At least one of newName or newUrl");
      } finally {
        await cleanup();
      }
    });
  });

  describe("read_project_journal_entry tool", () => {
    it("should return journal entry when it exists", async () => {
      // Arrange
      const agentLoopContext =
        await AgentLoopContextFactory.createRunContext(auth);

      const conversation = agentLoopContext.runContext!.conversation;
      await updateConversationSpace(conversation.id, projectSpace.id);

      // Create metadata with journal entry
      const metadata = await ProjectMetadataResource.makeNew(
        auth,
        projectSpace,
        {
          description: null,
          urls: [],
        }
      );

      // Update with journal entry
      await metadata.updateMetadata({
        journalEntry: "Today we made great progress on the feature",
      });

      const { client, cleanup } = await MCPTestUtils.createTestClient(
        auth,
        "project_context_management",
        agentLoopContext
      );

      try {
        // Act
        const result = await client.callTool({
          name: READ_PROJECT_JOURNAL_ENTRY_TOOL_NAME,
          arguments: {},
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain(
          "Today we made great progress on the feature"
        );
        expect(content[0].text).toContain("Successfully retrieved");
      } finally {
        await cleanup();
      }
    });

    it("should return message when no journal entry exists", async () => {
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
          name: READ_PROJECT_JOURNAL_ENTRY_TOOL_NAME,
          arguments: {},
        });

        // Assert
        const content = MCPTestUtils.assertToolSuccess(result);
        expect(content[0].text).toContain("No journal entry exists");
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
          name: READ_PROJECT_JOURNAL_ENTRY_TOOL_NAME,
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
