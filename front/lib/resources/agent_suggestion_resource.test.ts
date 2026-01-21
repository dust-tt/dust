import { beforeEach, describe, expect, it } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";

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
        agentConfiguration.sId,
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
      expect(suggestion.agentConfigurationId).toBe(agentConfiguration.sId);
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
        agentConfiguration.sId,
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
        agentConfiguration.sId,
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
        agentConfiguration.sId,
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

  describe("delete", () => {
    it("should delete a suggestion", async () => {
      const suggestion = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration.sId
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
  });

  describe("toJSON with discriminated union", () => {
    it("should allow type narrowing based on kind", async () => {
      const instructionsSuggestion =
        await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentConfiguration.sId,
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
});
