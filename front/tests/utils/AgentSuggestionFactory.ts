import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type {
  AgentSuggestionSource,
  AgentSuggestionState,
  CreateSuggestionType,
  DeleteSuggestionType,
  DescriptionSuggestionType,
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
  NameSuggestionType,
  ScopeSuggestionType,
  SkillsSuggestionType,
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import assert from "assert";

async function fetchAgent(
  auth: Authenticator,
  agentId: string
): Promise<AgentResource> {
  const agent = await AgentResource.fetchById(auth, agentId);
  assert(agent, `Agent ${agentId} not found`);
  return agent;
}

export class AgentSuggestionFactory {
  static async createInstructions(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: InstructionsSuggestionSchemaType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
      batchModelId: number | null;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      await fetchAgent(auth, agentConfiguration.sId),
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
        source: overrides.source ?? "sidekick",
        batchId: overrides.batchModelId ?? null,
      }
    );
  }

  static async createTools(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: ToolsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      await fetchAgent(auth, agentConfiguration.sId),
      {
        kind: "tools",
        suggestion: overrides.suggestion ?? {
          action: "add",
          toolId: "notion",
        },
        analysis: overrides.analysis ?? "Added useful integration",
        state: overrides.state ?? "pending",
      }
    );
  }

  static async createSubAgent(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: SubAgentSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      await fetchAgent(auth, agentConfiguration.sId),
      {
        kind: "sub_agent",
        suggestion: overrides.suggestion ?? {
          action: "add",
          toolId: "run_agent",
          childAgentId: "child_agent_sid",
        },
        analysis: overrides.analysis ?? "Added sub-agent delegation",
        state: overrides.state ?? "pending",
      }
    );
  }

  static async createSkills(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: SkillsSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      await fetchAgent(auth, agentConfiguration.sId),
      {
        kind: "skills",
        suggestion: overrides.suggestion ?? {
          action: "add",
          skillId: "code_review",
        },
        analysis: overrides.analysis ?? "Added skill for better assistance",
        state: overrides.state ?? "pending",
      }
    );
  }

  static async createModel(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: ModelSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      await fetchAgent(auth, agentConfiguration.sId),
      {
        kind: "model",
        suggestion: overrides.suggestion ?? {
          modelId: "claude-haiku-4-5-20251001",
          reasoningEffort: "medium",
        },
        analysis: overrides.analysis ?? "Suggested a more capable model",
        state: overrides.state ?? "pending",
        source: overrides.source ?? "conversational",
      }
    );
  }

  static async createCreate(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: CreateSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      batchModelId: number | null;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      await fetchAgent(auth, agentConfiguration.sId),
      {
        kind: "create",
        suggestion: overrides.suggestion ?? {
          name: "Incident Helper",
          description: "Helps triage incidents.",
          instructions: "Collect impact and timeline.",
        },
        analysis: overrides.analysis ?? "Suggested a new agent",
        state: overrides.state ?? "pending",
        conversationId: null,
        batchId: overrides.batchModelId ?? null,
      }
    );
  }

  static async createDelete(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: DeleteSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
      batchModelId: number | null;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    const agent = await fetchAgent(auth, agentConfiguration.sId);
    return AgentSuggestionResource.createSuggestionForAgent(auth, agent, {
      kind: "delete",
      suggestion: overrides.suggestion ?? { name: agent.name },
      analysis: overrides.analysis ?? "This agent is no longer used",
      state: overrides.state ?? "pending",
      conversationId: null,
      source: overrides.source ?? "conversational",
      batchId: overrides.batchModelId ?? null,
    });
  }

  static async createDescription(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: DescriptionSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      await fetchAgent(auth, agentConfiguration.sId),
      {
        kind: "description",
        suggestion: overrides.suggestion ?? {
          description: "Updated description",
        },
        analysis: overrides.analysis ?? "A clearer description for this agent",
        state: overrides.state ?? "pending",
        conversationId: null,
        source: overrides.source ?? "conversational",
      }
    );
  }

  static async createName(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: NameSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
      batchModelId: number | null;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      await fetchAgent(auth, agentConfiguration.sId),
      {
        kind: "name",
        suggestion: overrides.suggestion ?? { name: "RenamedAgent" },
        analysis: overrides.analysis ?? "A clearer name for this agent",
        state: overrides.state ?? "pending",
        conversationId: null,
        source: overrides.source ?? "conversational",
        batchId: overrides.batchModelId ?? null,
      }
    );
  }

  static async createScope(
    auth: Authenticator,
    agentConfiguration: { sId: string },
    overrides: Partial<{
      suggestion: ScopeSuggestionType;
      analysis: string | null;
      state: AgentSuggestionState;
      source: AgentSuggestionSource;
      batchModelId: number | null;
    }> = {}
  ): Promise<AgentSuggestionResource> {
    return AgentSuggestionResource.createSuggestionForAgent(
      auth,
      await fetchAgent(auth, agentConfiguration.sId),
      {
        kind: "scope",
        suggestion: overrides.suggestion ?? { scope: "visible" },
        analysis: overrides.analysis ?? "This agent is ready to be published",
        state: overrides.state ?? "pending",
        conversationId: null,
        source: overrides.source ?? "conversational",
        batchId: overrides.batchModelId ?? null,
      }
    );
  }

  static async setCreatedAt(
    suggestion: AgentSuggestionResource,
    createdAt: Date
  ): Promise<void> {
    // biome-ignore lint/plugin/noRawSql: Raw SQL is the only reliable way to backdate timestamps in tests
    await frontSequelize.query(
      `UPDATE agent_suggestions SET "createdAt" = :createdAt, "updatedAt" = :createdAt WHERE id = :id`,
      {
        replacements: {
          createdAt: createdAt.toISOString(),
          id: suggestion.id,
        },
      }
    );
  }
}
