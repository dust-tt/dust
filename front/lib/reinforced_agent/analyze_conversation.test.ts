import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
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
    instructions: null,
    model: {
      modelId: "gpt-4o-mini",
      providerId: "openai",
      temperature: 0.7,
    },
    status: "active",
    scope: "visible",
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
  };
}

function makeAction(
  overrides: Partial<ServerSideMCPServerConfigurationType> = {}
): ServerSideMCPServerConfigurationType {
  return {
    id: 1,
    sId: "tool-1",
    type: "mcp_server_configuration",
    name: "test_tool",
    description: null,
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: "view-1",
    dustAppConfiguration: null,
    secretName: null,
    dustProject: null,
    internalMCPServerId: null,
    ...overrides,
  };
}

describe("buildAnalysisPrompt", () => {
  it("includes agent name in user message", () => {
    const agent = makeAgentConfig({ name: "SalesBot" });
    const { userMessage } = buildAnalysisPrompt(
      agent,
      "User: hello",
      "No tools.",
      []
    );

    expect(userMessage).toContain("Name: SalesBot");
  });

  it("includes description when present", () => {
    const agent = makeAgentConfig({ description: "Handles sales queries" });
    const { userMessage } = buildAnalysisPrompt(
      agent,
      "User: hello",
      "No tools.",
      []
    );

    expect(userMessage).toContain("Description: Handles sales queries");
  });

  it("omits description section when empty", () => {
    const agent = makeAgentConfig({ description: "" });
    const { userMessage } = buildAnalysisPrompt(
      agent,
      "User: hello",
      "No tools.",
      []
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
      "No tools.",
      []
    );

    expect(userMessage).toContain("### Current instructions");
    expect(userMessage).toContain("<p>Be polite</p>");
  });

  it("omits instructions section when null", () => {
    const agent = makeAgentConfig({ instructionsHtml: null });
    const { userMessage } = buildAnalysisPrompt(
      agent,
      "User: hello",
      "No tools.",
      []
    );

    expect(userMessage).not.toContain("### Current instructions");
  });

  it("wraps conversation text in <conversation> tags", () => {
    const conversationText = "User: What is Dust?\nAgent: Dust is a platform.";
    const { userMessage } = buildAnalysisPrompt(
      makeAgentConfig(),
      conversationText,
      "No tools.",
      []
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
      toolsContext,
      []
    );

    expect(userMessage).toContain(toolsContext);
  });

  it("system prompt mentions the three available tools", () => {
    const { systemPrompt } = buildAnalysisPrompt(
      makeAgentConfig(),
      "User: hello",
      "No tools.",
      []
    );

    expect(systemPrompt).toContain("suggest_prompt_edits");
    expect(systemPrompt).toContain("suggest_tools");
    expect(systemPrompt).toContain("suggest_skills");
  });

  it("includes agent configured tools in user message", () => {
    const action = makeAction({ name: "web_search", sId: "tool-ws" });
    const { userMessage } = buildAnalysisPrompt(
      makeAgentConfig({ actions: [action] }),
      "User: hello",
      "No tools.",
      []
    );

    expect(userMessage).toContain("## Agent's configured tools");
    expect(userMessage).toContain("web_search (ID: tool-ws)");
  });

  it("includes agent configured skills in user message", () => {
    const skill = { name: "code_review", sId: "skill-cr" };
    const { userMessage } = buildAnalysisPrompt(
      makeAgentConfig(),
      "User: hello",
      "No tools.",
      [skill]
    );

    expect(userMessage).toContain("## Agent's configured skills");
    expect(userMessage).toContain("code_review (ID: skill-cr)");
  });
});
