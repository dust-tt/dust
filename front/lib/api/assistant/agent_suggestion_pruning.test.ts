import { beforeEach, describe, expect, it } from "vitest";

import { pruneSuggestionsForAgent } from "@app/lib/api/assistant/agent_suggestion_pruning";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";

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

describe("pruneSuggestionsForAgent", () => {
  let authenticator: Authenticator;
  let agentConfiguration: LightAgentConfigurationType;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "builder" });
    authenticator = testSetup.authenticator;

    agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
  });

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

      await pruneSuggestionsForAgent(authenticator, fullAgent);

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

      await pruneSuggestionsForAgent(authenticator, fullAgent);

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

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      // Model matches but reasoning effort differs -> still pending
      expect(fetched?.state).toBe("pending");
    });
  });

  describe("tools suggestions", () => {
    it("should mark tool suggestion as outdated when tool to remove no longer exists", async () => {
      // Create a suggestion to remove a tool that doesn't exist in the agent.
      const suggestion = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            action: "remove",
            toolId: "non_existent_tool",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentConfiguration.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

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
            action: "add",
            toolId: "new_tool_to_add",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentConfiguration.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("pending");
    });
  });

  describe("sub_agent suggestions", () => {
    it("should mark sub_agent suggestion as outdated when sub_agent to remove no longer exists", async () => {
      // Create a suggestion to remove a sub-agent that doesn't exist in the agent.
      const suggestion = await AgentSuggestionFactory.createSubAgent(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            action: "remove",
            toolId: "run_agent",
            childAgentId: "non_existent_child_agent",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentConfiguration.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("outdated");
    });

    it("should not mark sub_agent suggestion as outdated when sub_agent to add does not exist", async () => {
      const suggestion = await AgentSuggestionFactory.createSubAgent(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            action: "add",
            toolId: "run_agent",
            childAgentId: "new_child_agent_to_add",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentConfiguration.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

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
            action: "add",
            skillId: skill.sId,
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentConfiguration.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

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
            action: "add",
            skillId: "go-deep",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentConfiguration.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("outdated");
    });

    it("should mark skill suggestion as outdated when skill to remove no longer exists", async () => {
      const suggestion = await AgentSuggestionFactory.createSkills(
        authenticator,
        agentConfiguration,
        {
          suggestion: {
            action: "remove",
            skillId: "non_existent_skill",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentConfiguration.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

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
            action: "add",
            skillId: "new_skill_to_add",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentConfiguration.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("pending");
    });
  });

  describe("instructions suggestions", () => {
    it("should mark suggestion as outdated when target block ID does not exist", async () => {
      const agentWithInstructions =
        await AgentConfigurationFactory.updateTestAgent(
          authenticator,
          agentConfiguration.sId,
          {
            instructionsHtml:
              '<p data-block-id="abc12345">You are a helpful assistant.</p>',
          }
        );

      // Create a suggestion targeting a different block ID
      const suggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithInstructions,
        {
          suggestion: {
            targetBlockId: "xyz99999",
            content: "<p>New instructions</p>",
            type: "replace",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentWithInstructions.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("outdated");
    });

    it("should not mark suggestion as outdated when target block ID exists", async () => {
      const agentWithInstructions =
        await AgentConfigurationFactory.updateTestAgent(
          authenticator,
          agentConfiguration.sId,
          {
            instructionsHtml:
              '<p data-block-id="abc12345">You are a helpful assistant.</p>',
          }
        );

      // Create a suggestion targeting the existing block ID
      const suggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithInstructions,
        {
          suggestion: {
            targetBlockId: "abc12345",
            content: "<p>You are an expert assistant.</p>",
            type: "replace",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentWithInstructions.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("pending");
    });

    it("should not mark suggestion as outdated for instructions-root target", async () => {
      const agentWithInstructions =
        await AgentConfigurationFactory.updateTestAgent(
          authenticator,
          agentConfiguration.sId,
          {
            instructionsHtml:
              '<p data-block-id="abc12345">You are a helpful assistant.</p>',
          }
        );

      const suggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithInstructions,
        {
          suggestion: {
            targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
            content: "<p>Completely new instructions</p>",
            type: "replace",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentWithInstructions.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("pending");
    });

    it("should mark all suggestions as outdated when instructions are null", async () => {
      const agentWithoutInstructions =
        await AgentConfigurationFactory.updateTestAgent(
          authenticator,
          agentConfiguration.sId,
          {
            instructionsHtml: null,
          }
        );

      const suggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithoutInstructions,
        {
          suggestion: {
            targetBlockId: "abc12345",
            content: "<p>New instructions</p>",
            type: "replace",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentWithoutInstructions.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("outdated");
    });

    it("should handle multiple block IDs correctly", async () => {
      const agentWithMultipleBlocks =
        await AgentConfigurationFactory.updateTestAgent(
          authenticator,
          agentConfiguration.sId,
          {
            instructionsHtml:
              '<p data-block-id="block001">First paragraph.</p><p data-block-id="block002">Second paragraph.</p><h2 data-block-id="block003">Heading</h2>',
          }
        );

      const suggestion1 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithMultipleBlocks,
        {
          suggestion: {
            targetBlockId: "block002",
            content: "<p>Updated second paragraph.</p>",
            type: "replace",
          },
        }
      );

      const suggestion2 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithMultipleBlocks,
        {
          suggestion: {
            targetBlockId: "block999",
            content: "<p>New content.</p>",
            type: "replace",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentWithMultipleBlocks.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetched1 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion1.sId
      );
      const fetched2 = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestion2.sId
      );

      expect(fetched1?.state).toBe("pending");
      expect(fetched2?.state).toBe("outdated");
    });

    it("should not mark suggestions as outdated based on conflicts (handled at creation time)", async () => {
      // Note: Conflict resolution (root vs blocks, duplicate blocks) now happens
      // at suggestion creation time via pruneConflictingInstructionSuggestions().
      // pruneSuggestionsForAgent only checks for missing block IDs.

      // Create an agent with some blocks
      const agentWithBlocks = await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agentConfiguration.sId,
        {
          instructionsHtml:
            '<p data-block-id="block001">First.</p><p data-block-id="block002">Second.</p>',
        }
      );

      // Create a block-specific suggestion first
      const blockSuggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithBlocks,
        {
          suggestion: {
            targetBlockId: "block001",
            content: "<p>Updated first.</p>",
            type: "replace",
          },
        }
      );

      // Create an instructions-root suggestion - conflict detection doesn't happen here
      const rootSuggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithBlocks,
        {
          suggestion: {
            targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
            content: `<div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"><p>Completely new instructions.</p></div>`,
            type: "replace",
          },
        }
      );

      const fullAgent = await getFullAgentConfiguration(
        authenticator,
        agentWithBlocks.sId
      );

      await pruneSuggestionsForAgent(authenticator, fullAgent);

      const fetchedBlock = await AgentSuggestionResource.fetchById(
        authenticator,
        blockSuggestion.sId
      );
      const fetchedRoot = await AgentSuggestionResource.fetchById(
        authenticator,
        rootSuggestion.sId
      );

      expect(fetchedBlock?.state).toBe("pending");
      expect(fetchedRoot?.state).toBe("pending");
    });
  });

  describe("pruneConflictingInstructionSuggestions (hierarchy-aware)", () => {
    it("should mark child block suggestions as outdated when parent block suggestion is created", async () => {
      // Create nested structure: parent instructionBlock with child paragraphs
      const agentWithNested = await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agentConfiguration.sId,
        {
          instructionsHtml:
            '<div data-instruction-type="context" data-block-id="parent">' +
            '<p data-block-id="child1">First child.</p>' +
            '<p data-block-id="child2">Second child.</p>' +
            "</div>",
        }
      );

      // Create suggestions for the child blocks first
      const childSuggestion1 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithNested,
        {
          suggestion: {
            targetBlockId: "child1",
            content: "<p>Modified first child.</p>",
            type: "replace",
          },
        }
      );

      const childSuggestion2 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithNested,
        {
          suggestion: {
            targetBlockId: "child2",
            content: "<p>Modified second child.</p>",
            type: "replace",
          },
        }
      );

      // Both child suggestions should be pending initially
      expect(childSuggestion1.state).toBe("pending");
      expect(childSuggestion2.state).toBe("pending");

      // Now create a suggestion for the parent block
      const parentSuggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithNested,
        {
          suggestion: {
            targetBlockId: "parent",
            content:
              '<div data-instruction-type="context">' +
              "<p>Completely new parent content.</p>" +
              "</div>",
            type: "replace",
          },
        }
      );

      // Manually trigger conflict pruning (in production, suggest_prompt_edits does this)
      const { pruneConflictingInstructionSuggestions } = await import(
        "@app/lib/api/assistant/agent_suggestion_pruning"
      );
      await pruneConflictingInstructionSuggestions(
        authenticator,
        agentWithNested,
        [{ sId: parentSuggestion.sId, targetBlockId: "parent" }]
      );

      // Refetch the child suggestions
      const fetchedChild1 = await AgentSuggestionResource.fetchById(
        authenticator,
        childSuggestion1.sId
      );
      const fetchedChild2 = await AgentSuggestionResource.fetchById(
        authenticator,
        childSuggestion2.sId
      );

      // Child suggestions should be outdated (parent will replace them)
      expect(fetchedChild1?.state).toBe("outdated");
      expect(fetchedChild2?.state).toBe("outdated");

      // Parent suggestion should remain pending
      expect(parentSuggestion.state).toBe("pending");
    });

    it("should mark all block suggestions as outdated when instructions-root suggestion is created", async () => {
      // Create agent with blocks
      const agentWithBlocks = await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agentConfiguration.sId,
        {
          instructionsHtml:
            '<p data-block-id="block1">First.</p><p data-block-id="block2">Second.</p>',
        }
      );

      // Create suggestions for individual blocks
      const blockSuggestion1 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithBlocks,
        {
          suggestion: {
            targetBlockId: "block1",
            content: "<p>Modified first.</p>",
            type: "replace",
          },
        }
      );

      const blockSuggestion2 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithBlocks,
        {
          suggestion: {
            targetBlockId: "block2",
            content: "<p>Modified second.</p>",
            type: "replace",
          },
        }
      );

      // Both should be pending initially
      expect(blockSuggestion1.state).toBe("pending");
      expect(blockSuggestion2.state).toBe("pending");

      // Create instructions-root suggestion (full rewrite)
      const rootSuggestion = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentWithBlocks,
        {
          suggestion: {
            targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
            content: `<div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"><p>Brand new instructions.</p></div>`,
            type: "replace",
          },
        }
      );

      // Manually trigger conflict pruning (in production, suggest_prompt_edits does this)
      const { pruneConflictingInstructionSuggestions } = await import(
        "@app/lib/api/assistant/agent_suggestion_pruning"
      );
      await pruneConflictingInstructionSuggestions(
        authenticator,
        agentWithBlocks,
        [
          {
            sId: rootSuggestion.sId,
            targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
          },
        ]
      );

      // Refetch block suggestions
      const fetchedBlock1 = await AgentSuggestionResource.fetchById(
        authenticator,
        blockSuggestion1.sId
      );
      const fetchedBlock2 = await AgentSuggestionResource.fetchById(
        authenticator,
        blockSuggestion2.sId
      );

      // All block suggestions should be outdated (root replaces everything)
      expect(fetchedBlock1?.state).toBe("outdated");
      expect(fetchedBlock2?.state).toBe("outdated");

      // Root suggestion should remain pending
      expect(rootSuggestion.state).toBe("pending");
    });
  });
});
