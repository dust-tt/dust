import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { LightAgentConfigurationType } from "@app/types";
import type {
  AgentSuggestionSource,
  AgentSuggestionState,
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
  SkillsSuggestionType,
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";

export class AgentSuggestionFactory {
  static async createInstructions(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType,
    overrides: Partial<{
      suggestion: InstructionsSuggestionSchemaType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      agentConfiguration,
      {
        kind: "instructions",
        suggestion: overrides.suggestion ?? {
          content: "<p>You are a helpful assistant.</p>",
          targetBlockId: "12334",
          type: "replace",
        },
        analysis:
          overrides.analysis ?? "Improved instructions for better coding help",
        state: overrides.state ?? "pending",
        source: overrides.source ?? "reinforcement",
      }
    );
  }

  static async createTools(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType,
    overrides: Partial<{
      suggestion: ToolsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      agentConfiguration,
      {
        kind: "tools",
        suggestion: overrides.suggestion ?? {
          action: "add",
          toolId: "notion",
        },
        analysis: overrides.analysis ?? "Added useful integration",
        state: overrides.state ?? "pending",
        source: overrides.source ?? "reinforcement",
      }
    );
  }

  static async createSubAgent(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType,
    overrides: Partial<{
      suggestion: SubAgentSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      agentConfiguration,
      {
        kind: "sub_agent",
        suggestion: overrides.suggestion ?? {
          action: "add",
          toolId: "run_agent",
          childAgentId: "child_agent_sid",
        },
        analysis: overrides.analysis ?? "Added sub-agent delegation",
        state: overrides.state ?? "pending",
        source: overrides.source ?? "copilot",
      }
    );
  }

  static async createSkills(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType,
    overrides: Partial<{
      suggestion: SkillsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      agentConfiguration,
      {
        kind: "skills",
        suggestion: overrides.suggestion ?? {
          action: "add",
          skillId: "code_review",
        },
        analysis: overrides.analysis ?? "Added skill for better assistance",
        state: overrides.state ?? "pending",
        source: overrides.source ?? "copilot",
      }
    );
  }

  static async createModel(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType,
    overrides: Partial<{
      suggestion: ModelSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      agentConfiguration,
      {
        kind: "model",
        suggestion: overrides.suggestion ?? {
          modelId: "claude-haiku-4-5-20251001",
          reasoningEffort: "medium",
        },
        analysis: overrides.analysis ?? "Suggested a more capable model",
        state: overrides.state ?? "pending",
        source: overrides.source ?? "reinforcement",
      }
    );
  }
}
