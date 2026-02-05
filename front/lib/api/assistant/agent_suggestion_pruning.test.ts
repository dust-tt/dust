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

  // TODO(2026-02-05 COPILOT): Add tests for instructions suggestions once implemented.
  describe("instructions suggestions", () => {
    // it.skip("should mark suggestion as outdated when oldString is not in current instructions", async () => {
    //   const suggestion = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentConfiguration,
    //     {
    //       suggestion: {
    //         oldString: "This text does not exist",
    //         newString: "New text",
    //       },
    //     }
    //   );
    //   const fullAgent = await getFullAgentConfiguration(
    //     authenticator,
    //     agentConfiguration.sId
    //   );
    //   await pruneSuggestionsForAgent(authenticator, fullAgent);
    //   const fetched = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion.sId
    //   );
    //   expect(fetched?.state).toBe("outdated");
    // });
    // it.skip("should not mark suggestion as outdated when oldString exists in instructions", async () => {
    //   // The agent has "Test Instructions" as its instructions.
    //   const suggestion = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentConfiguration,
    //     {
    //       suggestion: {
    //         oldString: "Test Instructions",
    //         newString: "Updated Instructions",
    //       },
    //     }
    //   );
    //   const fullAgent = await getFullAgentConfiguration(
    //     authenticator,
    //     agentConfiguration.sId
    //   );
    //   await pruneSuggestionsForAgent(authenticator, fullAgent);
    //   const fetched = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion.sId
    //   );
    //   expect(fetched?.state).toBe("pending");
    // });
    // it.skip("should handle multiple non-overlapping suggestions correctly", async () => {
    //   // Create an agent with longer instructions.
    //   const agentWithLongInstructions =
    //     await AgentConfigurationFactory.updateTestAgent(
    //       authenticator,
    //       agentConfiguration.sId,
    //       {
    //         instructions: "Part A content. Part B content.",
    //       }
    //     );
    //   // Create two non-overlapping suggestions (most recent first in list).
    //   const suggestion1 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithLongInstructions,
    //     {
    //       suggestion: {
    //         oldString: "Part A content",
    //         newString: "Modified Part A",
    //       },
    //     }
    //   );
    //   const suggestion2 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithLongInstructions,
    //     {
    //       suggestion: {
    //         oldString: "Part B content",
    //         newString: "Modified Part B",
    //       },
    //     }
    //   );
    //   const fullAgent = await getFullAgentConfiguration(
    //     authenticator,
    //     agentWithLongInstructions.sId
    //   );
    //   await pruneSuggestionsForAgent(authenticator, fullAgent);
    //   const fetched1 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion1.sId
    //   );
    //   const fetched2 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion2.sId
    //   );
    //   // Both should still be pending as they don't overlap.
    //   expect(fetched1?.state).toBe("pending");
    //   expect(fetched2?.state).toBe("pending");
    // });
    // it.skip("should mark overlapping suggestion as outdated", async () => {
    //   // Create an agent with specific instructions.
    //   const agentWithInstructions =
    //     await AgentConfigurationFactory.updateTestAgent(
    //       authenticator,
    //       agentConfiguration.sId,
    //       {
    //         instructions: "Hello World",
    //       }
    //     );
    //   // First suggestion (created earlier, processed later) targets "World".
    //   const suggestion1 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithInstructions,
    //     {
    //       suggestion: {
    //         oldString: "World",
    //         newString: "Universe",
    //       },
    //     }
    //   );
    //   // Wait a bit to ensure different timestamps.
    //   await new Promise((resolve) => setTimeout(resolve, 10));
    //   // Second suggestion (created later, processed first) targets "Hello World" - overlaps with first.
    //   const suggestion2 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithInstructions,
    //     {
    //       suggestion: {
    //         oldString: "Hello World",
    //         newString: "Greetings Universe",
    //       },
    //     }
    //   );
    //   const fullAgent = await getFullAgentConfiguration(
    //     authenticator,
    //     agentWithInstructions.sId
    //   );
    //   await pruneSuggestionsForAgent(authenticator, fullAgent);
    //   const fetched1 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion1.sId
    //   );
    //   const fetched2 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion2.sId
    //   );
    //   // Suggestion2 (most recent) is processed first and applies.
    //   expect(fetched2?.state).toBe("pending");
    //   // Suggestion1 (older) cannot apply because the text is now changed.
    //   expect(fetched1?.state).toBe("outdated");
    // });
    // it.skip("should shift regions correctly when earlier suggestion changes text length", async () => {
    //   // Create an agent with specific instructions.
    //   const agentWithInstructions =
    //     await AgentConfigurationFactory.updateTestAgent(
    //       authenticator,
    //       agentConfiguration.sId,
    //       {
    //         instructions: "ABC DEF GHI",
    //       }
    //     );
    //   // Older suggestion targets "GHI" at the end.
    //   const suggestion1 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithInstructions,
    //     {
    //       suggestion: {
    //         oldString: "GHI",
    //         newString: "JKL",
    //       },
    //     }
    //   );
    //   await new Promise((resolve) => setTimeout(resolve, 10));
    //   // Newer suggestion targets "ABC" at the beginning.
    //   // This should still apply, and the region for "GHI" should shift.
    //   const suggestion2 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithInstructions,
    //     {
    //       suggestion: {
    //         oldString: "ABC",
    //         newString: "ABCXYZ", // Longer replacement
    //       },
    //     }
    //   );
    //   const fullAgent = await getFullAgentConfiguration(
    //     authenticator,
    //     agentWithInstructions.sId
    //   );
    //   await pruneSuggestionsForAgent(authenticator, fullAgent);
    //   const fetched1 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion1.sId
    //   );
    //   const fetched2 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion2.sId
    //   );
    //   // Both should still be pending - they edit different parts.
    //   expect(fetched1?.state).toBe("pending");
    //   expect(fetched2?.state).toBe("pending");
    // });
    // it.skip("should mark suggestion as outdated when expectedOccurrences does not match", async () => {
    //   // Create an agent with repeated text.
    //   const agentWithRepeatedText =
    //     await AgentConfigurationFactory.updateTestAgent(
    //       authenticator,
    //       agentConfiguration.sId,
    //       {
    //         instructions: "test test test",
    //       }
    //     );
    //   // Suggestion expects 2 occurrences but there are 3.
    //   const suggestion = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithRepeatedText,
    //     {
    //       suggestion: {
    //         oldString: "test",
    //         newString: "TEST",
    //         expectedOccurrences: 2,
    //       },
    //     }
    //   );
    //   const fullAgent = await getFullAgentConfiguration(
    //     authenticator,
    //     agentWithRepeatedText.sId
    //   );
    //   await pruneSuggestionsForAgent(authenticator, fullAgent);
    //   const fetched = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion.sId
    //   );
    //   expect(fetched?.state).toBe("outdated");
    // });
    // it.skip("should handle multiple occurrences correctly when count matches", async () => {
    //   // Create an agent with repeated text.
    //   const agentWithRepeatedText =
    //     await AgentConfigurationFactory.updateTestAgent(
    //       authenticator,
    //       agentConfiguration.sId,
    //       {
    //         instructions: "foo bar foo baz foo",
    //       }
    //     );
    //   // Suggestion expects 3 occurrences and there are exactly 3.
    //   const suggestion = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithRepeatedText,
    //     {
    //       suggestion: {
    //         oldString: "foo",
    //         newString: "FOO",
    //         expectedOccurrences: 3,
    //       },
    //     }
    //   );
    //   const fullAgent = await getFullAgentConfiguration(
    //     authenticator,
    //     agentWithRepeatedText.sId
    //   );
    //   await pruneSuggestionsForAgent(authenticator, fullAgent);
    //   const fetched = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion.sId
    //   );
    //   // Should still be pending since it can be applied (all 3 occurrences exist).
    //   expect(fetched?.state).toBe("pending");
    // });
    // it.skip("should handle multiple occurrences with another suggestion overlapping one", async () => {
    //   // Create an agent with repeated text.
    //   const agentWithRepeatedText =
    //     await AgentConfigurationFactory.updateTestAgent(
    //       authenticator,
    //       agentConfiguration.sId,
    //       {
    //         instructions: "AAA BBB AAA",
    //       }
    //     );
    //   // Older suggestion targets the middle part "BBB".
    //   const suggestion1 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithRepeatedText,
    //     {
    //       suggestion: {
    //         oldString: "BBB",
    //         newString: "CCC",
    //       },
    //     }
    //   );
    //   await new Promise((resolve) => setTimeout(resolve, 10));
    //   // Newer suggestion targets "AAA" (2 occurrences).
    //   const suggestion2 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithRepeatedText,
    //     {
    //       suggestion: {
    //         oldString: "AAA",
    //         newString: "XXX",
    //         expectedOccurrences: 2,
    //       },
    //     }
    //   );
    //   const fullAgent = await getFullAgentConfiguration(
    //     authenticator,
    //     agentWithRepeatedText.sId
    //   );
    //   await pruneSuggestionsForAgent(authenticator, fullAgent);
    //   const fetched1 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion1.sId
    //   );
    //   const fetched2 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion2.sId
    //   );
    //   // Both should be pending - AAA regions don't overlap with BBB region.
    //   expect(fetched1?.state).toBe("pending");
    //   expect(fetched2?.state).toBe("pending");
    // });
    // it.skip("should not mark suggestions as outdated when source regions overlap but changes don't", async () => {
    //   // Create an agent with specific instructions.
    //   const agentWithInstructions =
    //     await AgentConfigurationFactory.updateTestAgent(
    //       authenticator,
    //       agentConfiguration.sId,
    //       {
    //         instructions: "ABCDE",
    //       }
    //     );
    //   // Older suggestion targets "ABC" and changes B to X.
    //   const suggestion1 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithInstructions,
    //     {
    //       suggestion: {
    //         oldString: "ABC",
    //         newString: "AXXXXXC",
    //       },
    //     }
    //   );
    //   await new Promise((resolve) => setTimeout(resolve, 10));
    //   // Newer suggestion targets "CDE" and changes D to Y.
    //   // The source regions overlap at "C", but "C" is unchanged in both suggestions.
    //   const suggestion2 = await AgentSuggestionFactory.createInstructions(
    //     authenticator,
    //     agentWithInstructions,
    //     {
    //       suggestion: {
    //         oldString: "CDE",
    //         newString: "CYYYYYE",
    //       },
    //     }
    //   );
    //   const fullAgent = await getFullAgentConfiguration(
    //     authenticator,
    //     agentWithInstructions.sId
    //   );
    //   await pruneSuggestionsForAgent(authenticator, fullAgent);
    //   const fetched1 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion1.sId
    //   );
    //   const fetched2 = await AgentSuggestionResource.fetchById(
    //     authenticator,
    //     suggestion2.sId
    //   );
    //   // Both should remain pending since the actual changes don't overlap.
    //   expect(fetched1?.state).toBe("pending");
    //   expect(fetched2?.state).toBe("pending");
    // });
  });
});
