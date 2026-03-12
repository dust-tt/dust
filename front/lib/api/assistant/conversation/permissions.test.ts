import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { updateConversationRequirements } from "@app/lib/api/assistant/conversation/permissions";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/internal/assistant";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("updateConversationRequirements", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let projectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;
  let anotherProjectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    // Create project spaces
    projectSpace = await SpaceFactory.project(workspace);
    anotherProjectSpace = await SpaceFactory.project(workspace);

    // Add user to project spaces
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const projectSpaceGroup = projectSpace.groups.find(
      (g) => g.kind === "regular"
    );
    const anotherProjectSpaceGroup = anotherProjectSpace.groups.find(
      (g) => g.kind === "regular"
    );

    if (projectSpaceGroup) {
      const addRes = await projectSpaceGroup.dangerouslyAddMember(
        internalAdminAuth,
        {
          user: userJson,
        }
      );
      if (addRes.isErr()) {
        throw new Error(
          `Failed to add user to project space group: ${addRes.error.message}`
        );
      }
    }

    if (anotherProjectSpaceGroup) {
      const addRes = await anotherProjectSpaceGroup.dangerouslyAddMember(
        internalAdminAuth,
        {
          user: userJson,
        }
      );
      if (addRes.isErr()) {
        throw new Error(
          `Failed to add user to another project space group: ${addRes.error.message}`
        );
      }
    }

    await auth.refresh();
  });

  describe("project conversations", () => {
    it("should set requestedSpaceIds to only the project space", async () => {
      // Create a project conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        spaceId: projectSpace.id,
      });

      // Create agents with different space requirements
      const agent1 = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });
      const agent2 = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 2",
      });

      // Update agents to have space requirements
      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [anotherProjectSpace.id] },
        {
          where: {
            sId: agent1.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Fetch conversation to get the full type
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const projectConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements with agents that have different space requirements
      await updateConversationRequirements(auth, {
        agents: [agent1, agent2],
        conversation: projectConversation,
      });

      // Verify the conversation requirements are set to only the project space
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toHaveLength(1);
      expect(updatedConversation.requestedSpaceIds[0]).toBe(projectSpace.sId);
    });

    it("should not update if requirements are already correct", async () => {
      // Create a project conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        spaceId: projectSpace.id,
      });

      // Manually set the requirements to the project space
      await ConversationResource.updateRequirements(auth, conversation.sId, [
        projectSpace.id,
      ]);

      // Fetch conversation
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const projectConversation = fetchedConversationResult.value;

      // Verify initial state
      expect(projectConversation.requestedSpaceIds).toHaveLength(1);
      expect(projectConversation.requestedSpaceIds[0]).toBe(projectSpace.sId);

      // Call updateConversationRequirements - should not update
      await updateConversationRequirements(auth, {
        agents: [],
        conversation: projectConversation,
      });

      // Verify requirements are unchanged
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toHaveLength(1);
      expect(updatedConversation.requestedSpaceIds[0]).toBe(projectSpace.sId);
    });
  });

  describe("regular conversations", () => {
    it("should add space requirements from agents", async () => {
      // Create a regular conversation (no spaceId)
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create agents with space requirements
      const agent1 = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });
      const agent2 = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 2",
      });

      // Update agents to have space requirements
      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [projectSpace.id] },
        {
          where: {
            sId: agent1.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [anotherProjectSpace.id] },
        {
          where: {
            sId: agent2.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Fetch agents with updated requirements
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent1.sId, agent2.sId],
        variant: "light",
      });

      // Fetch conversation
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements
      await updateConversationRequirements(auth, {
        agents,
        conversation: regularConversation,
      });

      // Verify the conversation requirements include both spaces
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds.length).toBeGreaterThan(0);
      expect(updatedConversation.requestedSpaceIds).toContain(projectSpace.sId);
      expect(updatedConversation.requestedSpaceIds).toContain(
        anotherProjectSpace.sId
      );
    });

    it("should add space requirements from content fragments", async () => {
      const { DataSourceViewFactory } = await import(
        "@app/tests/utils/DataSourceViewFactory"
      );

      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create a data source view in a project space
      const dsView = await DataSourceViewFactory.folder(
        workspace,
        projectSpace,
        auth.user() ?? null
      );

      // Create content fragment input
      const contentFragment: ContentFragmentInputWithContentNode = {
        title: "Test Fragment",
        nodeId: "test-node-id",
        nodeDataSourceViewId: dsView.sId,
      };

      // Fetch conversation
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements with content fragment
      await updateConversationRequirements(auth, {
        contentFragment,
        conversation: regularConversation,
      });

      // Verify the conversation requirements include the space from the content fragment
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toContain(projectSpace.sId);
    });

    it("should add space requirements from both agents and content fragments", async () => {
      const { DataSourceViewFactory } = await import(
        "@app/tests/utils/DataSourceViewFactory"
      );

      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create an agent with space requirements
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });

      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [projectSpace.id] },
        {
          where: {
            sId: agent.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Create a data source view in another project space
      const dsView = await DataSourceViewFactory.folder(
        workspace,
        anotherProjectSpace,
        auth.user() ?? null
      );

      const contentFragment: ContentFragmentInputWithContentNode = {
        title: "Test Fragment",
        nodeId: "test-node-id",
        nodeDataSourceViewId: dsView.sId,
      };

      // Fetch agents and conversation
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent.sId],
        variant: "light",
      });

      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements with both
      await updateConversationRequirements(auth, {
        agents,
        contentFragment,
        conversation: regularConversation,
      });

      // Verify the conversation requirements include both spaces
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toContain(projectSpace.sId);
      expect(updatedConversation.requestedSpaceIds).toContain(
        anotherProjectSpace.sId
      );
    });

    it("should not duplicate existing space requirements", async () => {
      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Manually set initial requirements
      await ConversationResource.updateRequirements(auth, conversation.sId, [
        projectSpace.id,
      ]);

      // Create an agent with the same space requirement
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });

      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [projectSpace.id] },
        {
          where: {
            sId: agent.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Fetch agent and conversation
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent.sId],
        variant: "light",
      });

      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements
      await updateConversationRequirements(auth, {
        agents,
        conversation: regularConversation,
      });

      // Verify requirements are not duplicated
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      const projectSpaceIdCount = updatedConversation.requestedSpaceIds.filter(
        (id) => id === projectSpace.sId
      ).length;
      expect(projectSpaceIdCount).toBe(1);
    });

    it("should handle agents with no space requirements", async () => {
      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create an agent with no space requirements (empty array)
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });

      // Fetch agent and conversation
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent.sId],
        variant: "light",
      });

      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements
      await updateConversationRequirements(auth, {
        agents,
        conversation: regularConversation,
      });

      // Verify requirements are unchanged (no new requirements added)
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      // Should have no new requirements added
      expect(updatedConversation.requestedSpaceIds.length).toBe(
        regularConversation.requestedSpaceIds.length
      );
    });

    it("should handle empty agents and content fragments", async () => {
      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Fetch conversation
      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      const initialRequirements = regularConversation.requestedSpaceIds.length;

      // Call updateConversationRequirements with empty inputs
      await updateConversationRequirements(auth, {
        agents: [],
        conversation: regularConversation,
      });

      // Verify requirements are unchanged
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds.length).toBe(
        initialRequirements
      );
    });

    it("should preserve existing requirements when adding new ones", async () => {
      // Create a regular conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Manually set initial requirements
      await ConversationResource.updateRequirements(auth, conversation.sId, [
        projectSpace.id,
      ]);

      // Create an agent with a different space requirement
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent 1",
      });

      const { AgentConfigurationModel } = await import(
        "@app/lib/models/agent/agent"
      );
      await AgentConfigurationModel.update(
        { requestedSpaceIds: [anotherProjectSpace.id] },
        {
          where: {
            sId: agent.sId,
            workspaceId: workspace.id,
          },
          hooks: false,
          silent: true,
        }
      );

      // Fetch agent and conversation
      const { getAgentConfigurations } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );
      const agents = await getAgentConfigurations(auth, {
        agentIds: [agent.sId],
        variant: "light",
      });

      const fetchedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Call updateConversationRequirements
      await updateConversationRequirements(auth, {
        agents,
        conversation: regularConversation,
      });

      // Verify both old and new requirements are present
      const updatedConversationResult = await getConversation(
        auth,
        conversation.sId
      );
      if (updatedConversationResult.isErr()) {
        throw new Error("Failed to fetch updated conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      expect(updatedConversation.requestedSpaceIds).toContain(projectSpace.sId);
      expect(updatedConversation.requestedSpaceIds).toContain(
        anotherProjectSpace.sId
      );
    });
  });
});
