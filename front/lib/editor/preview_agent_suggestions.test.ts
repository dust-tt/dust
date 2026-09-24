import { getBrowserMarkdownPipeline } from "@app/lib/editor/browser_markdown_pipeline";
import { previewAgentSuggestions } from "@app/lib/editor/preview_agent_suggestions";
import { convertMarkdownToBlockHtml } from "@app/lib/editor/skill_instructions_html";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import { describe, expect, it } from "vitest";

const BASE_SUGGESTION: Omit<AgentSuggestionType, "kind" | "suggestion"> = {
  id: 1,
  sId: "asu-1",
  createdAt: 0,
  updatedAt: 0,
  agentConfigurationId: 1,
  analysis: null,
  state: "pending",
  source: "conversational",
  conversationId: null,
  batchId: null,
};

const [CURRENT_MODEL, SUGGESTED_MODEL] = SUPPORTED_MODEL_CONFIGS;

const AGENT = {
  name: "Current name",
  description: "Current description",
  scope: "hidden",
  instructions: null,
  instructionsHtml: null,
  model: {
    providerId: CURRENT_MODEL.providerId,
    modelId: CURRENT_MODEL.modelId,
    temperature: 0.4,
    reasoningEffort: CURRENT_MODEL.defaultReasoningEffort,
  },
} as const;

function blockIds(html: string): string[] {
  return [...html.matchAll(/data-block-id="([^"]+)"/g)].map((m) => m[1]);
}

function instructionsSuggestion(
  targetBlockId: string,
  content: string
): AgentSuggestionType {
  return {
    ...BASE_SUGGESTION,
    kind: "instructions",
    suggestion: { targetBlockId, content, type: "replace" },
  };
}

describe("previewAgentSuggestions", () => {
  const pipeline = getBrowserMarkdownPipeline();

  it("merges field suggestions and keeps untouched fields", () => {
    const suggestions: AgentSuggestionType[] = [
      { ...BASE_SUGGESTION, kind: "name", suggestion: { name: "First" } },
      { ...BASE_SUGGESTION, kind: "name", suggestion: { name: "Second" } },
      { ...BASE_SUGGESTION, kind: "scope", suggestion: { scope: "visible" } },
    ];

    const result = previewAgentSuggestions({
      agent: AGENT,
      suggestions,
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        ...AGENT,
        name: "Second",
        scope: "visible",
      });
    }
  });

  it("applies an instruction edit to its block", () => {
    const html = convertMarkdownToBlockHtml(
      "First para\n\nSecond para",
      pipeline
    );
    const [, , secondId] = blockIds(html);

    const result = previewAgentSuggestions({
      agent: { ...AGENT, instructionsHtml: html },
      suggestions: [instructionsSuggestion(secondId, "<p>Rewritten para</p>")],
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("First para");
      expect(result.value.instructions).toContain("Rewritten para");
      expect(result.value.instructions).not.toContain("Second para");
      expect(result.value.instructionsHtml).toContain("Rewritten para");
    }
  });

  it("returns an error when the agent has no instructions html", () => {
    const result = previewAgentSuggestions({
      agent: AGENT,
      suggestions: [instructionsSuggestion("deadbeef", "<p>Nope</p>")],
      pipeline,
    });

    expect(result.isErr()).toBe(true);
  });

  it("resolves a model suggestion and keeps the temperature", () => {
    const result = previewAgentSuggestions({
      agent: AGENT,
      suggestions: [
        {
          ...BASE_SUGGESTION,
          kind: "model",
          suggestion: { modelId: SUGGESTED_MODEL.modelId },
        },
      ],
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.model).toEqual({
        providerId: SUGGESTED_MODEL.providerId,
        modelId: SUGGESTED_MODEL.modelId,
        temperature: 0.4,
        reasoningEffort: SUGGESTED_MODEL.defaultReasoningEffort,
      });
    }
  });

  it("returns an error for suggestions that cannot be previewed", () => {
    const result = previewAgentSuggestions({
      agent: AGENT,
      suggestions: [
        {
          ...BASE_SUGGESTION,
          kind: "skills",
          suggestion: { action: "add", skillId: "skl_1" },
        },
      ],
      pipeline,
    });

    expect(result.isErr()).toBe(true);
  });
});
