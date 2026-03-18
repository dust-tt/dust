import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { buildAggregationPrompt } from "@app/lib/reinforced_agent/aggregate_suggestions";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentInstructionsSuggestionType,
  AgentSkillsSuggestionType,
  AgentToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import { describe, expect, it } from "vitest";

function makeAgentConfig(
  overrides: Partial<AgentConfigurationType> = {}
): AgentConfigurationType {
  return {
    id: 1,
    sId: "agent-1",
    version: 1,
    versionCreatedAt: null,
    versionAuthorId: null,
    model: {
      modelId: "gpt-4o-mini" as const,
      providerId: "openai" as const,
      temperature: 0.7,
      reasoningEffort: null,
    },
    status: "active",
    scope: "workspace",
    userFavorite: false,
    name: "TestAgent",
    description: "A test agent",
    pictureUrl: "https://example.com/pic.png",
    maxStepsPerRun: 3,
    tags: [],
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    canRead: true,
    canEdit: true,
    instructionsHtml: null,
    instructions: null,
    actions: [],
    ...overrides,
  } as AgentConfigurationType;
}

function makeInstructionSuggestion(
  overrides: Partial<AgentInstructionsSuggestionType> = {}
): AgentInstructionsSuggestionType {
  return {
    id: 1,
    sId: "sug-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentConfigurationId: 1,
    analysis: "Should be more polite",
    state: "pending",
    source: "synthetic",
    conversationId: null,
    kind: "instructions",
    suggestion: {
      content: "<p>Always be polite.</p>",
      targetBlockId: "instructions-root",
      type: "replace",
    },
    ...overrides,
  };
}

function makeToolSuggestion(
  overrides: Partial<AgentToolsSuggestionType> = {}
): AgentToolsSuggestionType {
  return {
    id: 2,
    sId: "sug-2",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentConfigurationId: 1,
    analysis: "Needs search capability",
    state: "pending",
    source: "synthetic",
    conversationId: null,
    kind: "tools",
    suggestion: {
      action: "add",
      toolId: "tool-search",
    },
    ...overrides,
  };
}

function makeSkillSuggestion(
  overrides: Partial<AgentSkillsSuggestionType> = {}
): AgentSkillsSuggestionType {
  return {
    id: 3,
    sId: "sug-3",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentConfigurationId: 1,
    analysis: "Needs coding skill",
    state: "pending",
    source: "synthetic",
    conversationId: null,
    kind: "skills",
    suggestion: {
      action: "add",
      skillId: "skill-code",
    },
    ...overrides,
  };
}

describe("buildAggregationPrompt", () => {
  it("includes the agent name in the user message", () => {
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig({ name: "SalesBot" }),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).toContain("Name: SalesBot");
  });

  it("formats instruction suggestions with targetBlockId and content", () => {
    const suggestion = makeInstructionSuggestion({
      suggestion: {
        content: "<p>New instructions</p>",
        targetBlockId: "block-42",
        type: "replace",
      },
    });
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [suggestion],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).toContain("kind: instructions");
    expect(userMessage).toContain("targetBlockId: block-42");
    expect(userMessage).toContain("content: <p>New instructions</p>");
  });

  it("formats tool suggestions with action and toolId", () => {
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeToolSuggestion()],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).toContain("kind: tools");
    expect(userMessage).toContain("action: add");
    expect(userMessage).toContain("toolId: tool-search");
  });

  it("formats skill suggestions with action and skillId", () => {
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeSkillSuggestion()],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).toContain("kind: skills");
    expect(userMessage).toContain("action: add");
    expect(userMessage).toContain("skillId: skill-code");
  });

  it("shows N/A when analysis is null", () => {
    const suggestion = makeInstructionSuggestion({ analysis: null });
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [suggestion],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).toContain("analysis: N/A");
  });

  it("numbers multiple suggestions sequentially", () => {
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeInstructionSuggestion(), makeToolSuggestion()],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).toContain("### Suggestion 1");
    expect(userMessage).toContain("### Suggestion 2");
  });

  it("includes pending suggestions section when non-empty", () => {
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeInstructionSuggestion()],
      { pending: [makeToolSuggestion()], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).toContain(
      "## Existing pending suggestions (do NOT duplicate these)"
    );
  });

  it("omits pending suggestions section when empty", () => {
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).not.toContain("Existing pending suggestions");
  });

  it("includes rejected suggestions section when non-empty", () => {
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [makeToolSuggestion()] },
      "No tools.",
      []
    );

    expect(userMessage).toContain(
      "## Previously rejected suggestions (do NOT recreate similar ones)"
    );
  });

  it("omits rejected suggestions section when empty", () => {
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).not.toContain("Previously rejected suggestions");
  });

  it("includes tools and skills context", () => {
    const toolsContext = "## Available tools\n- web_search\n- code_review";
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] },
      toolsContext,
      []
    );

    expect(userMessage).toContain(toolsContext);
  });

  it("system prompt mentions the three tools", () => {
    const { systemPrompt } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(systemPrompt).toContain("suggest_prompt_edits");
    expect(systemPrompt).toContain("suggest_tools");
    expect(systemPrompt).toContain("suggest_skills");
  });

  it("includes agent configured tools in user message", () => {
    const action = {
      id: 1,
      sId: "tool-ws",
      type: "mcp_server_configuration",
      name: "web_search",
      description: "Search the web",
    } as ServerSideMCPServerConfigurationType;
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig({ actions: [action] }),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] },
      "No tools.",
      []
    );

    expect(userMessage).toContain("## Agent's configured tools");
    expect(userMessage).toContain("web_search (ID: tool-ws)");
  });

  it("includes agent configured skills in user message", () => {
    const skill = {
      name: "code_review",
      sId: "skill-cr",
      agentFacingDescription: "Review code for quality",
    } as SkillResource;
    const { userMessage } = buildAggregationPrompt(
      makeAgentConfig(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] },
      "No tools.",
      [skill]
    );

    expect(userMessage).toContain("## Agent's configured skills");
    expect(userMessage).toContain("code_review (ID: skill-cr)");
  });
});
