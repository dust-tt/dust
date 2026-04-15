import {
  hasSuggestionSelfConflict,
  instructionEditSetsConflict,
  toolEditSetsConflict,
} from "@app/lib/reinforcement/skill_suggestion_pruning";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { SkillEditSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { describe, expect, it } from "vitest";

const HIERARCHY_HTML = `
  <div data-block-id="section-1">
    <p data-block-id="para-1">First paragraph.</p>
    <p data-block-id="para-2">Second paragraph.</p>
  </div>
  <div data-block-id="section-2">
    <p data-block-id="para-3">Third paragraph.</p>
  </div>
`;

function makeInstructionEdit(targetBlockId: string): {
  targetBlockId: string;
  content: string;
  type: "replace";
} {
  return {
    targetBlockId,
    content: `<p>Content for ${targetBlockId}</p>`,
    type: "replace",
  };
}

function makeToolEdit(
  toolId: string,
  action: "add" | "remove" = "add"
): { toolId: string; action: "add" | "remove" } {
  return { toolId, action };
}

describe("instructionEditSetsConflict", () => {
  it("returns false when either set is empty", () => {
    expect(
      instructionEditSetsConflict([], [makeInstructionEdit("para-1")], null)
    ).toBe(false);
    expect(
      instructionEditSetsConflict([makeInstructionEdit("para-1")], [], null)
    ).toBe(false);
    expect(instructionEditSetsConflict([], [], null)).toBe(false);
  });

  it("conflicts when either set contains root rewrite", () => {
    const root = makeInstructionEdit(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID);
    const block = makeInstructionEdit("para-1");

    expect(instructionEditSetsConflict([root], [block], null)).toBe(true);
    expect(instructionEditSetsConflict([block], [root], null)).toBe(true);
    expect(instructionEditSetsConflict([root], [root], null)).toBe(true);
  });

  it("conflicts when both sets target the same block ID", () => {
    const editA = makeInstructionEdit("para-1");
    const editB = makeInstructionEdit("para-1");

    expect(instructionEditSetsConflict([editA], [editB], null)).toBe(true);
  });

  it("does not conflict when sets target different, unrelated blocks", () => {
    expect(
      instructionEditSetsConflict(
        [makeInstructionEdit("para-1")],
        [makeInstructionEdit("para-3")],
        HIERARCHY_HTML
      )
    ).toBe(false);
  });

  it("conflicts when A targets an ancestor of a block in B", () => {
    expect(
      instructionEditSetsConflict(
        [makeInstructionEdit("section-1")],
        [makeInstructionEdit("para-1")],
        HIERARCHY_HTML
      )
    ).toBe(true);
  });

  it("conflicts when B targets an ancestor of a block in A (symmetric)", () => {
    expect(
      instructionEditSetsConflict(
        [makeInstructionEdit("para-1")],
        [makeInstructionEdit("section-1")],
        HIERARCHY_HTML
      )
    ).toBe(true);
  });

  it("does not conflict for siblings even without instructionsHtml", () => {
    expect(
      instructionEditSetsConflict(
        [makeInstructionEdit("para-1")],
        [makeInstructionEdit("para-2")],
        null
      )
    ).toBe(false);
  });

  it("does not conflict for siblings with instructionsHtml", () => {
    expect(
      instructionEditSetsConflict(
        [makeInstructionEdit("para-1")],
        [makeInstructionEdit("para-2")],
        HIERARCHY_HTML
      )
    ).toBe(false);
  });

  it("conflicts when a block in A targets a deeply nested descendant via B", () => {
    expect(
      instructionEditSetsConflict(
        [makeInstructionEdit("section-1")],
        [makeInstructionEdit("para-2")],
        HIERARCHY_HTML
      )
    ).toBe(true);
  });
});

describe("toolEditSetsConflict", () => {
  it("returns false when sets target different tool IDs", () => {
    expect(
      toolEditSetsConflict(
        [makeToolEdit("tool-search")],
        [makeToolEdit("tool-calendar")]
      )
    ).toBe(false);
  });

  it("conflicts when sets share a tool ID", () => {
    expect(
      toolEditSetsConflict(
        [makeToolEdit("tool-search", "add")],
        [makeToolEdit("tool-search", "remove")]
      )
    ).toBe(true);
  });

  it("conflicts when both sets add the same tool ID", () => {
    expect(
      toolEditSetsConflict(
        [makeToolEdit("tool-search", "add")],
        [makeToolEdit("tool-search", "add")]
      )
    ).toBe(true);
  });

  it("returns false when either set is empty", () => {
    expect(toolEditSetsConflict([], [makeToolEdit("tool-search")])).toBe(false);
    expect(toolEditSetsConflict([makeToolEdit("tool-search")], [])).toBe(false);
  });
});

function makeSuggestion(
  overrides: Partial<SkillEditSuggestionType> = {}
): SkillEditSuggestionType {
  return {
    instructionEdits: [],
    toolEdits: [],
    ...overrides,
  } as SkillEditSuggestionType;
}

describe("hasSuggestionSelfConflict", () => {
  it("returns false for non-conflicting instruction edits", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          instructionEdits: [
            makeInstructionEdit("para-1"),
            makeInstructionEdit("para-3"),
          ],
        }),
        HIERARCHY_HTML
      )
    ).toBe(false);
  });

  it("conflicts when root rewrite is combined with any other instruction edit", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          instructionEdits: [
            makeInstructionEdit(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID),
            makeInstructionEdit("para-1"),
          ],
        }),
        null
      )
    ).toBe(true);
  });

  it("conflicts when two instruction edits target the same block", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          instructionEdits: [
            makeInstructionEdit("para-1"),
            makeInstructionEdit("para-1"),
          ],
        }),
        null
      )
    ).toBe(true);
  });

  it("conflicts when one instruction edit targets an ancestor of another", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          instructionEdits: [
            makeInstructionEdit("section-1"),
            makeInstructionEdit("para-1"),
          ],
        }),
        HIERARCHY_HTML
      )
    ).toBe(true);
  });

  it("conflicts when two tool edits target the same tool ID", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          toolEdits: [
            makeToolEdit("tool-search", "add"),
            makeToolEdit("tool-search", "remove"),
          ],
        }),
        null
      )
    ).toBe(true);
  });

  it("returns false for mixed non-conflicting instruction and tool edits", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          instructionEdits: [makeInstructionEdit("para-1")],
          toolEdits: [makeToolEdit("tool-search")],
        }),
        HIERARCHY_HTML
      )
    ).toBe(false);
  });
});
