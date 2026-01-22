import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { ModelId } from "@app/types";
import type {
  AgentSuggestionSource,
  AgentSuggestionState,
  InstructionsSuggestionType,
  ModelSuggestionType,
  SkillsSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";

export class AgentSuggestionFactory {
  static async createInstructions(
    auth: Authenticator,
    agentConfigurationId: ModelId,
    overrides: Partial<{
      suggestion: InstructionsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.makeNew(auth, {
      agentConfigurationId,
      kind: "instructions",
      suggestion: overrides.suggestion ?? {
        oldString: "You are a helpful assistant.",
        newString: "You are an expert assistant specialized in coding.",
        expectedOccurrences: 1,
      },
      analysis:
        overrides.analysis ?? "Improved instructions for better coding help",
      state: overrides.state ?? "pending",
      source: overrides.source ?? "reinforcement",
    });
  }

  static async createTools(
    auth: Authenticator,
    agentConfigurationId: ModelId,
    overrides: Partial<{
      suggestion: ToolsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.makeNew(auth, {
      agentConfigurationId,
      kind: "tools",
      suggestion: overrides.suggestion ?? {
        additions: [
          { id: "notion", additionalConfiguration: { database: "tasks" } },
          { id: "slack" },
        ],
        deletions: ["deprecated_tool"],
      },
      analysis: overrides.analysis ?? "Added useful integrations",
      state: overrides.state ?? "pending",
      source: overrides.source ?? "reinforcement",
    });
  }

  static async createSkills(
    auth: Authenticator,
    agentConfigurationId: ModelId,
    overrides: Partial<{
      suggestion: SkillsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.makeNew(auth, {
      agentConfigurationId,
      kind: "skills",
      suggestion: overrides.suggestion ?? {
        additions: ["code_review", "summarization"],
      },
      analysis: overrides.analysis ?? "Added skills for better assistance",
      state: overrides.state ?? "pending",
      source: overrides.source ?? "copilot",
    });
  }

  static async createModel(
    auth: Authenticator,
    agentConfigurationId: ModelId,
    overrides: Partial<{
      suggestion: ModelSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.makeNew(auth, {
      agentConfigurationId,
      kind: "model",
      suggestion: overrides.suggestion ?? {
        modelId: "claude-haiku-4-5-20251001",
        reasoningEffort: "medium",
      },
      analysis: overrides.analysis ?? "Suggested a more capable model",
      state: overrides.state ?? "pending",
      source: overrides.source ?? "reinforcement",
    });
  }
}
