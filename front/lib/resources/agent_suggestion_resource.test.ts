import { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("AgentSuggestionResource", () => {
  let workspace: WorkspaceType;
  let authenticator: Authenticator;
  let agentConfiguration: LightAgentConfigurationType;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "builder" });
    workspace = testSetup.workspace;
    authenticator = testSetup.authenticator;

    agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
  });

  describe("instructions suggestion", () => {
    it("should create and fetch an instructions suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>Be extremely helpful and detailed</p>",
            targetBlockId: "abc12345",
            type: "replace",
          },
          analysis: "Making the agent more helpful",
        }
      );

      expect(suggestion).toBeDefined();
      expect(suggestion.sId).toMatch(/^asu_/);
      expect(suggestion.workspaceId).toBe(workspace.id);
      expect(suggestion.agentConfigurationId).toBe(agentConfiguration.id);
      expect(suggestion.kind).toBe("instructions");
      expect(suggestion.state).toBe("pending");
      expect(suggestion.source).toBe("reinforcement");

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched).toBeDefined();
      expect(fetched?.sId).toBe(suggestion.sId);
      expect(fetched?.kind).toBe("instructions");

      const json = fetched!.toJSON();
      expect(json.kind).toBe("instructions");
      expect(json.suggestion).toEqual({
        content: "<p>Be extremely helpful and detailed</p>",
        targetBlockId: "abc12345",
        type: "replace",
      });
    });
  });

  describe("tools suggestion", () => {
    it("should create and fetch a tools add suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            action: "add",
            toolId: "github",
          },
          analysis: "Adding GitHub tool",
        }
      );

      expect(suggestion).toBeDefined();
      expect(suggestion.kind).toBe("tools");

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched).toBeDefined();

      const json = fetched!.toJSON();
      expect(json.kind).toBe("tools");
      expect(json.suggestion).toEqual({
        action: "add",
        toolId: "github",
      });
    });

    it("should create and fetch a tools remove suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            action: "remove",
            toolId: "old_tool",
          },
          analysis: "Removing old tool",
        }
      );

      expect(suggestion).toBeDefined();
      expect(suggestion.kind).toBe("tools");

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched).toBeDefined();

      const json = fetched!.toJSON();
      expect(json.kind).toBe("tools");
      expect(json.suggestion).toEqual({
        action: "remove",
        toolId: "old_tool",
      });
    });
  });

  describe("skills suggestion", () => {
    it("should create and fetch a skills add suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createSkills(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            action: "add",
            skillId: "data_analysis",
          },
          source: "copilot",
        }
      );

      expect(suggestion).toBeDefined();
      expect(suggestion.kind).toBe("skills");
      expect(suggestion.source).toBe("copilot");

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched).toBeDefined();

      const json = fetched!.toJSON();
      expect(json.kind).toBe("skills");
      expect(json.suggestion).toEqual({
        action: "add",
        skillId: "data_analysis",
      });
    });

    it("should create and fetch a skills remove suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createSkills(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            action: "remove",
            skillId: "old_skill",
          },
          source: "copilot",
        }
      );

      expect(suggestion).toBeDefined();
      expect(suggestion.kind).toBe("skills");
      expect(suggestion.source).toBe("copilot");

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched).toBeDefined();

      const json = fetched!.toJSON();
      expect(json.kind).toBe("skills");
      expect(json.suggestion).toEqual({
        action: "remove",
        skillId: "old_skill",
      });
    });
  });

  describe("model suggestion", () => {
    it("should create and fetch a model suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createModel(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            modelId: "claude-haiku-4-5-20251001",
            reasoningEffort: "high",
          },
          analysis: "Upgrading to a more capable model",
        }
      );

      expect(suggestion).toBeDefined();
      expect(suggestion.kind).toBe("model");

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched).toBeDefined();

      const json = fetched!.toJSON();
      expect(json.kind).toBe("model");
      expect(json.suggestion).toEqual({
        modelId: "claude-haiku-4-5-20251001",
        reasoningEffort: "high",
      });
    });
  });

  describe("bulkUpdateState", () => {
    it.each<"approved" | "rejected" | "outdated">([
      "approved",
      "rejected",
      "outdated",
    ])("should update a suggestion state to %s", async (newState:
      | "approved"
      | "rejected"
      | "outdated") => {
      const suggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>new content</p>",
            targetBlockId: "block123",
            type: "replace",
          },
        }
      );

      expect(suggestion.state).toBe("pending");

      await AgentSuggestionResource.bulkUpdateState(
        authenticator,
        [suggestion],
        newState
      );

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe(newState);
    });

    it("should update multiple suggestions at once", async () => {
      const suggestion1 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>new1</p>",
            targetBlockId: "block1",
            type: "replace",
          },
        }
      );
      const suggestion2 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>new2</p>",
            targetBlockId: "block2",
            type: "replace",
          },
        }
      );

      await AgentSuggestionResource.bulkUpdateState(
        authenticator,
        [suggestion1, suggestion2],
        "approved"
      );

      const fetched1 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion1.sId
      );
      const fetched2 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion2.sId
      );
      expect(fetched1?.state).toBe("approved");
      expect(fetched2?.state).toBe("approved");
    });

    it("should fail to update state when user is not an editor of the agent", async () => {
      const suggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>new</p>",
            targetBlockId: "block123",
            type: "replace",
          },
        }
      );

      // Create a different user who is not an editor of the agent.
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      await expect(
        AgentSuggestionResource.bulkUpdateState(
          otherAuthenticator,
          [suggestion],
          "approved"
        )
      ).rejects.toThrow("User does not have permission to edit this agent");
    });
  });

  describe("delete", () => {
    it("should delete a suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration
      );
      const sId = suggestion.sId;

      const result = await suggestion.delete(authenticator);
      expect(result.isOk()).toBe(true);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        sId
      );
      expect(fetched).toBeNull();
    });

    it("should fail to delete when user is not an editor of the agent", async () => {
      const suggestion = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration
      );

      // Create a different user who is not an editor of the agent.
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const result = await suggestion.delete(otherAuthenticator);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "User does not have permission to edit this agent"
        );
      }
    });
  });

  describe("createSuggestionForAgent permission check", () => {
    it("should fail to create suggestion when user is not an editor of the agent", async () => {
      // Create a different user who is not an editor of the agent.
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      await expect(
        AgentSuggestionResource.createSuggestionForAgent(
          otherAuthenticator,
          agentConfiguration,
          {
            kind: "instructions",
            suggestion: {
              content: "<p>new</p>",
              targetBlockId: "block123",
              type: "replace",
            },
            analysis: null,
            state: "pending",
            source: "copilot",
          }
        )
      ).rejects.toThrow("User does not have permission to edit this agent");
    });
  });

  describe("fetchById permission check", () => {
    it("should not return suggestion when user is not an editor of the agent", async () => {
      const suggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration
      );

      // Create a different user who is not an editor of the agent.
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const fetched = await AgentSuggestionResource.fetchById(
        otherAuthenticator,
        suggestion.sId
      );
      expect(fetched).toBeNull();
    });
  });

  describe("toJSON with discriminated union", () => {
    it("should allow type narrowing based on kind", async () => {
      const instructionsSuggestion =
        await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              content: "<p>new content</p>",
              targetBlockId: "block123",
              type: "replace",
            },
          }
        );

      const json = instructionsSuggestion.toJSON();

      // Type narrowing based on kind
      switch (json.kind) {
        case "instructions":
          expect(json.suggestion.content).toBe("<p>new content</p>");
          expect(json.suggestion.targetBlockId).toBe("block123");
          expect(json.suggestion.type).toBe("replace");
          break;
        case "tools":
        case "skills":
        case "model":
        case "sub_agent":
          throw new Error("Unexpected kind");
      }
    });
  });

  describe("listByAgentConfigurationId", () => {
    it("should list all suggestions for an agent by sId", async () => {
      // Create multiple suggestions.
      await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>b</p>",
            targetBlockId: "block1",
            type: "replace",
          },
        }
      );
      await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration
      );
      await AgentSuggestionFactory.createModel(
        authenticator,
        agentConfiguration
      );

      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agentConfiguration.sId
        );

      expect(suggestions).toHaveLength(3);
    });

    it("should filter by state", async () => {
      const pending = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>b</p>",
            targetBlockId: "block1",
            type: "replace",
          },
          state: "pending",
        }
      );
      await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration
      );

      await AgentSuggestionResource.bulkUpdateState(
        authenticator,
        [pending],
        "approved"
      );

      const pendingSuggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agentConfiguration.sId,
          { states: ["pending"] }
        );

      expect(pendingSuggestions).toHaveLength(1);
      expect(pendingSuggestions[0].kind).toBe("tools");

      const approvedSuggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agentConfiguration.sId,
          { states: ["approved"] }
        );

      expect(approvedSuggestions).toHaveLength(1);
      expect(approvedSuggestions[0].kind).toBe("instructions");

      const approvedAndPendingSuggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agentConfiguration.sId,
          { states: ["approved", "pending"] }
        );

      expect(approvedAndPendingSuggestions).toHaveLength(2);
    });

    it("should filter by kind", async () => {
      await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>b</p>",
            targetBlockId: "block1",
            type: "replace",
          },
        }
      );
      await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration
      );
      await AgentSuggestionFactory.createModel(
        authenticator,
        agentConfiguration
      );

      const instructionsSuggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agentConfiguration.sId,
          { kind: "instructions" }
        );

      expect(instructionsSuggestions).toHaveLength(1);
      expect(instructionsSuggestions[0].kind).toBe("instructions");

      const toolsSuggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agentConfiguration.sId,
          { kind: "tools" }
        );

      expect(toolsSuggestions).toHaveLength(1);
      expect(toolsSuggestions[0].kind).toBe("tools");
    });

    it("should filter by both state and kind", async () => {
      const instructions1 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>b</p>",
            targetBlockId: "block1",
            type: "replace",
          },
        }
      );
      await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>d</p>",
            targetBlockId: "block2",
            type: "replace",
          },
        }
      );
      await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration
      );

      await AgentSuggestionResource.bulkUpdateState(
        authenticator,
        [instructions1],
        "approved"
      );

      const results = await AgentSuggestionResource.listByAgentConfigurationId(
        authenticator,
        agentConfiguration.sId,
        { states: ["pending"], kind: "instructions" }
      );

      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe("instructions");
      expect(results[0].state).toBe("pending");
    });

    it("should return empty array for non-existent agent", async () => {
      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          "non_existent_sid"
        );

      expect(suggestions).toHaveLength(0);
    });

    it("should limit the number of returned suggestions and return most recent first", async () => {
      // Create 3 pending suggestions.
      const createdSuggestions = [];
      for (let i = 0; i < 3; i++) {
        const suggestion = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              content: `<p>new-${i}</p>`,
              targetBlockId: `block${i}`,
              type: "replace",
            },
          }
        );
        createdSuggestions.push(suggestion);
      }

      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agentConfiguration.sId,
          { limit: 2 }
        );

      expect(suggestions).toHaveLength(2);
      // Verify we get the 2 most recent suggestions (created last).
      expect(suggestions[0].sId).toBe(createdSuggestions[2].sId);
      expect(suggestions[1].sId).toBe(createdSuggestions[1].sId);
    });

    it("should not return suggestions when user is not an editor of the agent", async () => {
      await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>b</p>",
            targetBlockId: "block1",
            type: "replace",
          },
        }
      );

      // Create a different user who is not an editor of the agent.
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          otherAuthenticator,
          agentConfiguration.sId
        );

      expect(suggestions).toHaveLength(0);
    });

    it("should retrieve suggestions from multiple agent versions", async () => {
      // Create a suggestion for the initial agent (version 0).
      const suggestion1 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>v0-new</p>",
            targetBlockId: "block-v0",
            type: "replace",
          },
        }
      );

      // Update the agent to create a new version (version 1).
      const updatedAgent = await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agentConfiguration.sId,
        { instructions: "Updated instructions for version 1" }
      );

      // The sId remains the same but the model ID changes.
      expect(updatedAgent.sId).toBe(agentConfiguration.sId);
      expect(updatedAgent.id).not.toBe(agentConfiguration.id);

      // Create a suggestion for the new version.
      const suggestion2 = await AgentSuggestionFactory.createTools(
        authenticator,
        updatedAgent
      );

      // Verify listByAgentConfigurationId returns both suggestions.
      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agentConfiguration.sId
        );

      expect(suggestions).toHaveLength(2);

      const suggestionIds = suggestions.map((s) => s.sId);
      expect(suggestionIds).toContain(suggestion1.sId);
      expect(suggestionIds).toContain(suggestion2.sId);
    });
  });

  describe("deleteAllForWorkspace", () => {
    it("should delete all suggestions for the workspace", async () => {
      // Create an admin authenticator for this workspace
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Create multiple suggestions for different agents
      const suggestion1 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>new1</p>",
            targetBlockId: "block1",
            type: "replace",
          },
        }
      );

      const agentConfiguration2 =
        await AgentConfigurationFactory.createTestAgent(authenticator, {
          name: "Test Agent 2",
        });
      const suggestion2 = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration2
      );

      // Verify both suggestions exist
      const fetched1 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion1.sId
      );
      const fetched2 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion2.sId
      );
      expect(fetched1).toBeDefined();
      expect(fetched2).toBeDefined();
      // Delete all suggestions for the workspace using admin auth
      await AgentSuggestionResource.deleteAllForWorkspace(adminAuth);

      // Verify both suggestions are deleted
      const deletedSuggestion1 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion1.sId
      );
      const deletedSuggestion2 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion2.sId
      );
      expect(deletedSuggestion1).toBeNull();
      expect(deletedSuggestion2).toBeNull();
    });

    it("should fail when user is not an admin", async () => {
      const suggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>new</p>",
            targetBlockId: "block1",
            type: "replace",
          },
        }
      );

      // Create a different user who is not an admin
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      await expect(
        AgentSuggestionResource.deleteAllForWorkspace(otherAuthenticator)
      ).rejects.toThrow("Only workspace admins can delete all suggestions");

      // Verify suggestion still exists
      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched).toBeDefined();
    });

    it("should only delete suggestions from the authenticated workspace", async () => {
      // Create an admin authenticator for workspace1
      const adminAuth1 = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Create a suggestion in workspace1
      const suggestion1 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            content: "<p>new1</p>",
            targetBlockId: "block1",
            type: "replace",
          },
        }
      );

      // Create a second workspace with its own suggestion
      const { authenticator: authenticator2 } = await createResourceTest({
        role: "builder",
      });

      const agentConfiguration2 =
        await AgentConfigurationFactory.createTestAgent(authenticator2);
      const suggestion2 = await AgentSuggestionFactory.createInstructions(
        authenticator2,
        agentConfiguration2,
        {
          suggestion: {
            content: "<p>new2</p>",
            targetBlockId: "block2",
            type: "replace",
          },
        }
      );

      // Verify both suggestions exist
      const fetched1 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion1.sId
      );
      const fetched2 = await AgentSuggestionResource.fetchById(
        authenticator2,
        suggestion2.sId
      );
      expect(fetched1).toBeDefined();
      expect(fetched2).toBeDefined();

      // Delete all suggestions for workspace1
      await AgentSuggestionResource.deleteAllForWorkspace(adminAuth1);

      // Verify workspace1 suggestion is deleted
      const deletedSuggestion1 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion1.sId
      );
      expect(deletedSuggestion1).toBeNull();

      // Verify workspace2 suggestion still exists
      const stillExistsSuggestion2 = await AgentSuggestionResource.fetchById(
        authenticator2,
        suggestion2.sId
      );
      expect(stillExistsSuggestion2).toBeDefined();
      expect(stillExistsSuggestion2?.sId).toBe(suggestion2.sId);
    });
  });
});
