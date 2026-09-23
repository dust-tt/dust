import { getBrowserMarkdownPipeline } from "@app/lib/editor/browser_markdown_pipeline";
import { previewSkillSuggestions } from "@app/lib/editor/preview_skill_suggestions";
import { convertMarkdownToBlockHtml } from "@app/lib/editor/skill_instructions_html";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { describe, expect, it } from "vitest";

const BASE_SUGGESTION: Omit<SkillSuggestionType, "kind" | "suggestion"> = {
  sId: "sug-1",
  createdAt: 0,
  updatedAt: 0,
  skillConfigurationId: "skl_abc123",
  analysis: null,
  title: null,
  state: "pending",
  source: "conversational",
  sourceConversationsCount: 0,
  visibleSourceConversationIds: [],
  notificationConversationId: null,
  updatedBy: null,
};

const SKILL = {
  name: "Current name",
  availability: "editors",
  agentFacingDescription: "Current agent description",
  userFacingDescription: "Current user description",
  instructions: null,
  instructionsHtml: null,
} as const;

function blockIds(html: string): string[] {
  return [...html.matchAll(/data-block-id="([^"]+)"/g)].map((m) => m[1]);
}

function editSuggestion(
  targetBlockId: string,
  content: string
): SkillSuggestionType {
  return {
    ...BASE_SUGGESTION,
    kind: "edit",
    suggestion: {
      instructionEdits: [{ targetBlockId, content, type: "replace" }],
    },
  };
}

describe("previewSkillSuggestions", () => {
  const pipeline = getBrowserMarkdownPipeline();

  it("merges field suggestions with the last one winning", () => {
    const suggestions: SkillSuggestionType[] = [
      { ...BASE_SUGGESTION, kind: "name", suggestion: { name: "First" } },
      { ...BASE_SUGGESTION, kind: "name", suggestion: { name: "Second" } },
      {
        ...BASE_SUGGESTION,
        kind: "user_facing_description",
        suggestion: { userFacingDescription: "New description" },
      },
      {
        ...BASE_SUGGESTION,
        kind: "availability",
        suggestion: { availability: "workspace_users" },
      },
    ];

    const result = previewSkillSuggestions({
      skill: SKILL,
      suggestions,
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        name: "Second",
        availability: "workspace_users",
        agentFacingDescription: "Current agent description",
        userFacingDescription: "New description",
        instructions: null,
        instructionsHtml: null,
      });
    }
  });

  it("applies an instruction edit to its block", () => {
    const html = convertMarkdownToBlockHtml(
      "First para\n\nSecond para",
      pipeline
    );
    const [, , secondId] = blockIds(html);

    const result = previewSkillSuggestions({
      skill: { ...SKILL, instructionsHtml: html },
      suggestions: [editSuggestion(secondId, "<p>Rewritten para</p>")],
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("First para");
      expect(result.value.instructions).toContain("Rewritten para");
      expect(result.value.instructions).not.toContain("Second para");
      expect(result.value.instructionsHtml).toContain("Rewritten para");
      expect(result.value.instructionsHtml).not.toContain("Second para");
    }
  });

  it("returns an error when the edit targets a missing block", () => {
    const html = convertMarkdownToBlockHtml("Only para", pipeline);

    const result = previewSkillSuggestions({
      skill: { ...SKILL, instructionsHtml: html },
      suggestions: [editSuggestion("deadbeef", "<p>Nope</p>")],
      pipeline,
    });

    expect(result.isErr()).toBe(true);
  });

  it("applies a root rewrite when the skill has no instructions html", () => {
    const result = previewSkillSuggestions({
      skill: SKILL,
      suggestions: [
        editSuggestion(
          INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
          `<div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"><p>Brand new instructions</p></div>`
        ),
      ],
      pipeline,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toBe("Brand new instructions");
    }
  });
});
