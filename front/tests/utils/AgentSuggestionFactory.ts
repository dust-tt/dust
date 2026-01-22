import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
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
    agentConfigurationId: string,
    overrides: Partial<{
      agentConfigurationVersion: number;
      suggestion: InstructionsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    const result = await AgentSuggestionResource.makeNew(auth, {
      agentConfigurationId,
      agentConfigurationVersion: overrides.agentConfigurationVersion ?? 1,
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
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  static async createTools(
    auth: Authenticator,
    agentConfigurationId: string,
    overrides: Partial<{
      agentConfigurationVersion: number;
      suggestion: ToolsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    const result = await AgentSuggestionResource.makeNew(auth, {
      agentConfigurationId,
      agentConfigurationVersion: overrides.agentConfigurationVersion ?? 1,
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
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  static async createSkills(
    auth: Authenticator,
    agentConfigurationId: string,
    overrides: Partial<{
      agentConfigurationVersion: number;
      suggestion: SkillsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    const result = await AgentSuggestionResource.makeNew(auth, {
      agentConfigurationId,
      agentConfigurationVersion: overrides.agentConfigurationVersion ?? 1,
      kind: "skills",
      suggestion: overrides.suggestion ?? {
        additions: ["code_review", "summarization"],
      },
      analysis: overrides.analysis ?? "Added skills for better assistance",
      state: overrides.state ?? "pending",
      source: overrides.source ?? "copilot",
    });
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  static async createModel(
    auth: Authenticator,
    agentConfigurationId: string,
    overrides: Partial<{
      agentConfigurationVersion: number;
      suggestion: ModelSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    const result = await AgentSuggestionResource.makeNew(auth, {
      agentConfigurationId,
      agentConfigurationVersion: overrides.agentConfigurationVersion ?? 1,
      kind: "model",
      suggestion: overrides.suggestion ?? {
        modelId: "claude-haiku-4-5-20251001",
        reasoningEffort: "medium",
      },
      analysis: overrides.analysis ?? "Suggested a more capable model",
      state: overrides.state ?? "pending",
      source: overrides.source ?? "reinforcement",
    });
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }
}
