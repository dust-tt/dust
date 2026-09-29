import { getBrowserMarkdownPipeline } from "@app/lib/editor/browser_markdown_pipeline";
import type { PreviewedAgentFields } from "@app/lib/editor/preview_agent_suggestions";
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
  agentId: "agent-1",
  analysis: null,
  state: "pending",
  source: "conversational",
  conversationId: null,
  batchId: null,
};

const [CURRENT_MODEL, SUGGESTED_MODEL] = SUPPORTED_MODEL_CONFIGS;

const AGENT: PreviewedAgentFields = {
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
  tags: [{ sId: "tag-sales", name: "Sales", kind: "standard" }],
};

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

  it("previews an agent creation as the proposed agent", () => {
    const result = previewAgentSuggestions({
      agent: AGENT,
      suggestions: [
        {
          ...BASE_SUGGESTION,
          kind: "create",
          suggestion: {
            name: "RandomQuoteAgent",
            description: "Shares a random quote.",
            instructions: "<p>Share one quote.</p>",
          },
        },
      ],
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fields).toEqual({
        name: "RandomQuoteAgent",
        description: "Shares a random quote.",
        scope: AGENT.scope,
        model: AGENT.model,
        tags: AGENT.tags,
        instructions: null,
        instructionsHtml: "<p>Share one quote.</p>",
      });
    }
  });

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
      expect(result.value.fields).toEqual({
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
      expect(result.value.fields.instructions).toContain("First para");
      expect(result.value.fields.instructions).toContain("Rewritten para");
      expect(result.value.fields.instructions).not.toContain("Second para");
      expect(result.value.fields.instructionsHtml).toContain("Rewritten para");
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
      expect(result.value.fields.model).toEqual({
        providerId: SUGGESTED_MODEL.providerId,
        modelId: SUGGESTED_MODEL.modelId,
        temperature: 0.4,
        reasoningEffort: SUGGESTED_MODEL.defaultReasoningEffort,
      });
    }
  });

  it("previews the tools and skills an agent creation comes with", () => {
    const result = previewAgentSuggestions({
      agent: AGENT,
      suggestions: [
        {
          ...BASE_SUGGESTION,
          kind: "create",
          suggestion: {
            name: "IncidentHelper",
            description: "Helps triage incidents.",
            instructions: "<p>Triage incidents.</p>",
            toolIds: ["msv_1"],
            skillIds: ["skl_1"],
          },
        },
      ],
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.capabilities).toEqual({
        addedToolIds: ["msv_1"],
        removedToolIds: [],
        addedSkillIds: ["skl_1"],
        removedSkillIds: [],
      });
    }
  });

  it("splits tool and skill suggestions into additions and removals", () => {
    const suggestions: AgentSuggestionType[] = [
      {
        ...BASE_SUGGESTION,
        kind: "tools",
        suggestion: { action: "add", toolId: "msv_1" },
      },
      {
        ...BASE_SUGGESTION,
        kind: "tools",
        suggestion: { action: "remove", toolId: "msv_2" },
      },
      {
        ...BASE_SUGGESTION,
        kind: "skills",
        suggestion: { action: "remove", skillId: "skl_1" },
      },
    ];

    const result = previewAgentSuggestions({
      agent: AGENT,
      suggestions,
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.capabilities).toEqual({
        addedToolIds: ["msv_1"],
        removedToolIds: ["msv_2"],
        addedSkillIds: [],
        removedSkillIds: ["skl_1"],
      });
    }
  });

  it("keeps previewing field edits batched with a skill suggestion", () => {
    const result = previewAgentSuggestions({
      agent: AGENT,
      suggestions: [
        { ...BASE_SUGGESTION, kind: "name", suggestion: { name: "Renamed" } },
        {
          ...BASE_SUGGESTION,
          kind: "skills",
          suggestion: { action: "add", skillId: "skl_1" },
        },
      ],
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fields.name).toBe("Renamed");
      expect(result.value.capabilities.addedSkillIds).toEqual(["skl_1"]);
    }
  });

  it("previews the tags once the suggested ones are added and removed", () => {
    const result = previewAgentSuggestions({
      agent: {
        ...AGENT,
        tags: [
          { sId: "tag-sales", name: "Sales", kind: "standard" },
          { sId: "tag-hr", name: "HR", kind: "standard" },
        ],
      },
      suggestions: [
        {
          ...BASE_SUGGESTION,
          kind: "tags",
          suggestion: { addTags: ["Support", "hr"], removeTags: ["sales"] },
        },
      ],
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fields.tags.map((tag) => tag.name)).toEqual([
        "HR",
        "Support",
      ]);
    }
  });

  it("returns an error for knowledge suggestions", () => {
    const result = previewAgentSuggestions({
      agent: AGENT,
      suggestions: [
        {
          ...BASE_SUGGESTION,
          kind: "knowledge",
          suggestion: {
            action: "add",
            method: "search",
            dataSourceViewId: "dsv_1",
          },
        },
      ],
      pipeline,
    });

    expect(result.isErr()).toBe(true);
  });
});
