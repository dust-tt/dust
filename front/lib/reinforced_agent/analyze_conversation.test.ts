import { buildAnalysisPrompt } from "@app/lib/reinforced_agent/analyze_conversation";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
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
    actions: [],
    ...overrides,
  } as AgentConfigurationType;
}

describe("buildAnalysisPrompt", () => {
  it("includes agent name in user message", () => {
    const agent = makeAgentConfig({ name: "SalesBot" });
    const { userMessage } = buildAnalysisPrompt(
      agent,
      "User: hello",
      "No tools."
    );

    expect(userMessage).toContain("Name: SalesBot");
  });

  it("includes description when present", () => {
    const agent = makeAgentConfig({ description: "Handles sales queries" });
    const { userMessage } = buildAnalysisPrompt(
      agent,
      "User: hello",
      "No tools."
    );

    expect(userMessage).toContain("Description: Handles sales queries");
  });

  it("omits description section when empty", () => {
    const agent = makeAgentConfig({ description: "" });
    const { userMessage } = buildAnalysisPrompt(
      agent,
      "User: hello",
      "No tools."
    );

    expect(userMessage).not.toContain("Description:");
  });

  it("includes instructions when present", () => {
    const agent = makeAgentConfig({
      instructionsHtml: "<p>Be polite</p>",
    });
    const { userMessage } = buildAnalysisPrompt(
      agent,
      "User: hello",
      "No tools."
    );

    expect(userMessage).toContain("### Current instructions");
    expect(userMessage).toContain("<p>Be polite</p>");
  });

  it("omits instructions section when null", () => {
    const agent = makeAgentConfig({ instructionsHtml: null });
    const { userMessage } = buildAnalysisPrompt(
      agent,
      "User: hello",
      "No tools."
    );

    expect(userMessage).not.toContain("### Current instructions");
  });

  it("wraps conversation text in <conversation> tags", () => {
    const conversationText = "User: What is Dust?\nAgent: Dust is a platform.";
    const { userMessage } = buildAnalysisPrompt(
      makeAgentConfig(),
      conversationText,
      "No tools."
    );

    expect(userMessage).toContain("<conversation>");
    expect(userMessage).toContain(conversationText);
    expect(userMessage).toContain("</conversation>");
  });

  it("includes tools and skills context in user message", () => {
    const toolsContext = "## Available tools\n- search\n- browse";
    const { userMessage } = buildAnalysisPrompt(
      makeAgentConfig(),
      "User: hello",
      toolsContext
    );

    expect(userMessage).toContain(toolsContext);
  });

  it("system prompt mentions the three available tools", () => {
    const { systemPrompt } = buildAnalysisPrompt(
      makeAgentConfig(),
      "User: hello",
      "No tools."
    );

    expect(systemPrompt).toContain("suggest_prompt_edits");
    expect(systemPrompt).toContain("suggest_tools");
    expect(systemPrompt).toContain("suggest_skills");
  });
});
