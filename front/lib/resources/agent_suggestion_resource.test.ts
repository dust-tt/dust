import { beforeEach, describe, expect, it } from "vitest";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@app/types";

async function getFullAgentConfiguration(
  auth: Authenticator,
  agentId: string
): Promise<AgentConfigurationType> {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
  });
  if (!agent) {
    throw new Error(`Agent configuration not found for agentId: ${agentId}`);
  }
  return agent;
}

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
            oldString: "Be helpful",
            newString: "Be extremely helpful and detailed",
            expectedOccurrences: 1,
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
        oldString: "Be helpful",
        newString: "Be extremely helpful and detailed",
        expectedOccurrences: 1,
      });
    });
  });

  describe("tools suggestion", () => {
    it("should create and fetch a tools suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            additions: [
              { id: "github", additionalConfiguration: { repo: "dust" } },
              { id: "jira" },
            ],
            deletions: ["old_tool"],
          },
          analysis: "Adding project management tools",
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
        additions: [
          { id: "github", additionalConfiguration: { repo: "dust" } },
          { id: "jira" },
        ],
        deletions: ["old_tool"],
      });
    });
  });

  describe("skills suggestion", () => {
    it("should create and fetch a skills suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createSkills(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            additions: ["data_analysis"],
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
        additions: ["data_analysis"],
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
          suggestion: { oldString: "old", newString: "new" },
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
        { suggestion: { oldString: "old1", newString: "new1" } }
      );
      const suggestion2 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        { suggestion: { oldString: "old2", newString: "new2" } }
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
          suggestion: { oldString: "old", newString: "new" },
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
            suggestion: { oldString: "old", newString: "new" },
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
              oldString: "old",
              newString: "new",
            },
          }
        );

      const json = instructionsSuggestion.toJSON();

      // Type narrowing based on kind
      switch (json.kind) {
        case "instructions":
          expect(json.suggestion.oldString).toBe("old");
          expect(json.suggestion.newString).toBe("new");
          break;
        case "tools":
        case "skills":
        case "model":
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
        { suggestion: { oldString: "a", newString: "b" } }
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
        { suggestion: { oldString: "a", newString: "b" }, state: "pending" }
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
        { suggestion: { oldString: "a", newString: "b" } }
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
        { suggestion: { oldString: "a", newString: "b" } }
      );
      await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        { suggestion: { oldString: "c", newString: "d" } }
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
          { suggestion: { oldString: `old-${i}`, newString: `new-${i}` } }
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
        { suggestion: { oldString: "a", newString: "b" } }
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
        { suggestion: { oldString: "v0-old", newString: "v0-new" } }
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
          suggestion: { oldString: "old1", newString: "new1" },
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
          suggestion: { oldString: "old", newString: "new" },
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
          suggestion: { oldString: "old1", newString: "new1" },
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
          suggestion: { oldString: "old2", newString: "new2" },
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

  describe("pruneSuggestions", () => {
    describe("model suggestions", () => {
      it("should mark model suggestion as outdated when current model matches", async () => {
        const suggestion = await AgentSuggestionFactory.createModel(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              modelId: "gpt-4-turbo", // Same as agent's model
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("outdated");
      });

      it("should not mark model suggestion as outdated when models differ", async () => {
        const suggestion = await AgentSuggestionFactory.createModel(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              modelId: "claude-sonnet-4-5-20250929", // Different from agent's gpt-4-turbo
              reasoningEffort: "medium",
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("pending");
      });

      it("should not mark model suggestion as outdated when model matches but reasoning effort differs", async () => {
        const suggestion = await AgentSuggestionFactory.createModel(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              modelId: "gpt-4-turbo", // Same as agent's model
              reasoningEffort: "high", // Different reasoning effort
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        // Model matches but reasoning effort differs -> still pending
        expect(fetched?.state).toBe("pending");
      });
    });

    describe("tools suggestions", () => {
      it("should mark tool suggestion as outdated when tool to delete no longer exists", async () => {
        // Create a suggestion to delete a tool that doesn't exist in the agent.
        const suggestion = await AgentSuggestionFactory.createTools(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              deletions: ["non_existent_tool"],
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("outdated");
      });

      it("should not mark tool suggestion as outdated when tool to add does not exist", async () => {
        const suggestion = await AgentSuggestionFactory.createTools(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              additions: [{ id: "new_tool_to_add" }],
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("pending");
      });
    });

    describe("skills suggestions", () => {
      it("should mark skill suggestion as outdated when skill to add already exists", async () => {
        const skill = await SkillFactory.create(authenticator, {
          name: "Existing Skill",
        });

        await SkillFactory.linkToAgent(authenticator, {
          skillId: skill.id,
          agentConfigurationId: agentConfiguration.id,
        });

        const suggestion = await AgentSuggestionFactory.createSkills(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              additions: [skill.sId],
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("outdated");
      });

      it("should mark skill suggestion as outdated when global skill to add already exists", async () => {
        await SkillFactory.linkGlobalSkillToAgent(authenticator, {
          globalSkillId: "go-deep",
          agentConfigurationId: agentConfiguration.id,
        });

        const suggestion = await AgentSuggestionFactory.createSkills(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              additions: ["go-deep"],
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("outdated");
      });

      it("should mark skill suggestion as outdated when skill to delete no longer exists", async () => {
        const suggestion = await AgentSuggestionFactory.createSkills(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              deletions: ["non_existent_skill"],
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("outdated");
      });

      it("should not mark skill suggestion as outdated when skill to add does not exist", async () => {
        const suggestion = await AgentSuggestionFactory.createSkills(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              additions: ["new_skill_to_add"],
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("pending");
      });
    });

    describe("instructions suggestions", () => {
      it("should mark suggestion as outdated when oldString is not in current instructions", async () => {
        const suggestion = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              oldString: "This text does not exist",
              newString: "New text",
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("outdated");
      });

      it("should not mark suggestion as outdated when oldString exists in instructions", async () => {
        // The agent has "Test Instructions" as its instructions.
        const suggestion = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              oldString: "Test Instructions",
              newString: "Updated Instructions",
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentConfiguration.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("pending");
      });

      it("should handle multiple non-overlapping suggestions correctly", async () => {
        // Create an agent with longer instructions.
        const agentWithLongInstructions =
          await AgentConfigurationFactory.updateTestAgent(
            authenticator,
            agentConfiguration.sId,
            {
              instructions: "Part A content. Part B content.",
            }
          );

        // Create two non-overlapping suggestions (most recent first in list).
        const suggestion1 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithLongInstructions,
          {
            suggestion: {
              oldString: "Part A content",
              newString: "Modified Part A",
            },
          }
        );

        const suggestion2 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithLongInstructions,
          {
            suggestion: {
              oldString: "Part B content",
              newString: "Modified Part B",
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentWithLongInstructions.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched1 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion1.sId
        );
        const fetched2 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion2.sId
        );

        // Both should still be pending as they don't overlap.
        expect(fetched1?.state).toBe("pending");
        expect(fetched2?.state).toBe("pending");
      });

      it("should mark overlapping suggestion as outdated", async () => {
        // Create an agent with specific instructions.
        const agentWithInstructions =
          await AgentConfigurationFactory.updateTestAgent(
            authenticator,
            agentConfiguration.sId,
            {
              instructions: "Hello World",
            }
          );

        // First suggestion (created earlier, processed later) targets "World".
        const suggestion1 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithInstructions,
          {
            suggestion: {
              oldString: "World",
              newString: "Universe",
            },
          }
        );

        // Wait a bit to ensure different timestamps.
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Second suggestion (created later, processed first) targets "Hello World" - overlaps with first.
        const suggestion2 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithInstructions,
          {
            suggestion: {
              oldString: "Hello World",
              newString: "Greetings Universe",
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentWithInstructions.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched1 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion1.sId
        );
        const fetched2 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion2.sId
        );

        // Suggestion2 (most recent) is processed first and applies.
        expect(fetched2?.state).toBe("pending");
        // Suggestion1 (older) cannot apply because the text is now changed.
        expect(fetched1?.state).toBe("outdated");
      });

      it("should shift regions correctly when earlier suggestion changes text length", async () => {
        // Create an agent with specific instructions.
        const agentWithInstructions =
          await AgentConfigurationFactory.updateTestAgent(
            authenticator,
            agentConfiguration.sId,
            {
              instructions: "ABC DEF GHI",
            }
          );

        // Older suggestion targets "GHI" at the end.
        const suggestion1 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithInstructions,
          {
            suggestion: {
              oldString: "GHI",
              newString: "JKL",
            },
          }
        );

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Newer suggestion targets "ABC" at the beginning.
        // This should still apply, and the region for "GHI" should shift.
        const suggestion2 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithInstructions,
          {
            suggestion: {
              oldString: "ABC",
              newString: "ABCXYZ", // Longer replacement
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentWithInstructions.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched1 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion1.sId
        );
        const fetched2 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion2.sId
        );

        // Both should still be pending - they edit different parts.
        expect(fetched1?.state).toBe("pending");
        expect(fetched2?.state).toBe("pending");
      });

      it("should mark suggestion as outdated when expectedOccurrences does not match", async () => {
        // Create an agent with repeated text.
        const agentWithRepeatedText =
          await AgentConfigurationFactory.updateTestAgent(
            authenticator,
            agentConfiguration.sId,
            {
              instructions: "test test test",
            }
          );

        // Suggestion expects 2 occurrences but there are 3.
        const suggestion = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithRepeatedText,
          {
            suggestion: {
              oldString: "test",
              newString: "TEST",
              expectedOccurrences: 2,
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentWithRepeatedText.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        expect(fetched?.state).toBe("outdated");
      });

      it("should handle multiple occurrences correctly when count matches", async () => {
        // Create an agent with repeated text.
        const agentWithRepeatedText =
          await AgentConfigurationFactory.updateTestAgent(
            authenticator,
            agentConfiguration.sId,
            {
              instructions: "foo bar foo baz foo",
            }
          );

        // Suggestion expects 3 occurrences and there are exactly 3.
        const suggestion = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithRepeatedText,
          {
            suggestion: {
              oldString: "foo",
              newString: "FOO",
              expectedOccurrences: 3,
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentWithRepeatedText.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion.sId
        );
        // Should still be pending since it can be applied (all 3 occurrences exist).
        expect(fetched?.state).toBe("pending");
      });

      it("should handle multiple occurrences with another suggestion overlapping one", async () => {
        // Create an agent with repeated text.
        const agentWithRepeatedText =
          await AgentConfigurationFactory.updateTestAgent(
            authenticator,
            agentConfiguration.sId,
            {
              instructions: "AAA BBB AAA",
            }
          );

        // Older suggestion targets the middle part "BBB".
        const suggestion1 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithRepeatedText,
          {
            suggestion: {
              oldString: "BBB",
              newString: "CCC",
            },
          }
        );

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Newer suggestion targets "AAA" (2 occurrences).
        const suggestion2 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithRepeatedText,
          {
            suggestion: {
              oldString: "AAA",
              newString: "XXX",
              expectedOccurrences: 2,
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentWithRepeatedText.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched1 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion1.sId
        );
        const fetched2 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion2.sId
        );

        // Both should be pending - AAA regions don't overlap with BBB region.
        expect(fetched1?.state).toBe("pending");
        expect(fetched2?.state).toBe("pending");
      });

      it("should not mark suggestions as outdated when source regions overlap but changes don't", async () => {
        // Create an agent with specific instructions.
        const agentWithInstructions =
          await AgentConfigurationFactory.updateTestAgent(
            authenticator,
            agentConfiguration.sId,
            {
              instructions: "ABCDE",
            }
          );

        // Older suggestion targets "ABC" and changes B to X.
        const suggestion1 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithInstructions,
          {
            suggestion: {
              oldString: "ABC",
              newString: "AXXXXXC",
            },
          }
        );

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Newer suggestion targets "CDE" and changes D to Y.
        // The source regions overlap at "C", but "C" is unchanged in both suggestions.
        const suggestion2 = await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentWithInstructions,
          {
            suggestion: {
              oldString: "CDE",
              newString: "CYYYYYE",
            },
          }
        );

        const fullAgent = await getFullAgentConfiguration(
          authenticator,
          agentWithInstructions.sId
        );

        await AgentSuggestionResource.pruneSuggestions(
          authenticator,
          fullAgent
        );

        const fetched1 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion1.sId
        );
        const fetched2 = await AgentSuggestionResource.fetchById(
          authenticator,
          suggestion2.sId
        );

        // Both should remain pending since the actual changes don't overlap.
        expect(fetched1?.state).toBe("pending");
        expect(fetched2?.state).toBe("pending");
      });
    });
  });
});
