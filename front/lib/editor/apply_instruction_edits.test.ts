// @vitest-environment node: the server has no DOM globals, jsdom must not hide a reliance on them.
import {
  applyInstructionEditsToHtml,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { beforeAll, describe, expect, it } from "vitest";

function blockIds(html: string): string[] {
  return [...html.matchAll(/data-block-id="([^"]+)"/g)].map((m) => m[1]);
}

describe("applyInstructionEditsToHtml", () => {
  beforeAll(() => {
    setupSkillInstructionsMarkdownPipeline();
  });

  it("replaces one block and leaves its siblings untouched", () => {
    const html = convertMarkdownToBlockHtml("First para\n\nSecond para");
    const [, firstId, secondId] = blockIds(html);

    const result = applyInstructionEditsToHtml(html, [
      { targetBlockId: secondId, content: "<p>Rewritten para</p>" },
    ]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("First para");
      expect(result.value.instructions).toContain("Rewritten para");
      expect(result.value.instructions).not.toContain("Second para");
      // Same node type, so the block keeps its id and the untouched sibling keeps its own.
      expect(blockIds(result.value.instructionsHtml)).toContain(firstId);
      expect(blockIds(result.value.instructionsHtml)).toContain(secondId);
    }
  });

  it("applies several edits targeting different blocks in one pass", () => {
    const html = convertMarkdownToBlockHtml("Alpha\n\nBravo\n\nCharlie");
    const [, alphaId, , charlieId] = blockIds(html);

    const result = applyInstructionEditsToHtml(html, [
      { targetBlockId: alphaId, content: "<p>Alpha edited</p>" },
      { targetBlockId: charlieId, content: "<p>Charlie edited</p>" },
    ]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("Alpha edited");
      expect(result.value.instructions).toContain("Bravo");
      expect(result.value.instructions).toContain("Charlie edited");
    }
  });

  it("replaces one block with several", () => {
    const html = convertMarkdownToBlockHtml("Only para");
    const [, onlyId] = blockIds(html);

    const result = applyInstructionEditsToHtml(html, [
      { targetBlockId: onlyId, content: "<p>One</p><p>Two</p>" },
    ]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("One");
      expect(result.value.instructions).toContain("Two");
      expect(result.value.instructions).not.toContain("Only para");
    }
  });

  it("rewrites everything when targeting the root", () => {
    const html = convertMarkdownToBlockHtml("Old one\n\nOld two");

    const result = applyInstructionEditsToHtml(html, [
      {
        targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
        content: `<div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"><p>Brand new</p></div>`,
      },
    ]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructions).toContain("Brand new");
      expect(result.value.instructions).not.toContain("Old one");
      expect(result.value.instructions).not.toContain("Old two");
    }
  });

  it("changes the block type when the edit does", () => {
    const html = convertMarkdownToBlockHtml("Plain para");
    const [, paraId] = blockIds(html);

    const result = applyInstructionEditsToHtml(html, [
      { targetBlockId: paraId, content: "<h2>Now a heading</h2>" },
    ]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.instructionsHtml).toContain("<h2");
      expect(result.value.instructions).toContain("Now a heading");
    }
  });

  it("mints fresh ids instead of keeping the ones in the edit's content", () => {
    const html = convertMarkdownToBlockHtml("Alpha\n\nBravo");
    const [, alphaId, bravoId] = blockIds(html);

    // The tool asks the model for the block "including the wrapping tag", so edit content
    // routinely repeats a `data-block-id` — here one that another block already uses.
    const result = applyInstructionEditsToHtml(html, [
      {
        targetBlockId: alphaId,
        content: `<p data-block-id="${bravoId}">One</p><p data-block-id="${bravoId}">Two</p>`,
      },
    ]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const ids = blockIds(result.value.instructionsHtml);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("fails without applying anything when one target is gone", () => {
    const html = convertMarkdownToBlockHtml("Alpha\n\nBravo");
    const [, alphaId] = blockIds(html);

    const result = applyInstructionEditsToHtml(html, [
      { targetBlockId: alphaId, content: "<p>Alpha edited</p>" },
      { targetBlockId: "gone12345", content: "<p>Never applied</p>" },
    ]);

    expect(result.isErr()).toBe(true);
  });
});
