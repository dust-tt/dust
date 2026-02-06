import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlockIdExtension } from "@app/components/editor/extensions/agent_builder/BlockIdExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import { stripHtmlAttributes } from "@app/components/editor/input_bar/cleanupPastedHTML";

describe("BlockIdExtension", () => {
  let editor: Editor;

  const BLOCK_ID_ATTR = "data-block-id";
  const BLOCK_ID_REGEX = /data-block-id="([a-f0-9]{8})"/;

  beforeEach(() => {
    editor = EditorFactory([BlockIdExtension]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should generate block IDs for paragraphs and headings", () => {
    editor.commands.setContent("# Heading\n\nParagraph", {
      contentType: "markdown",
    });

    const html = editor.getHTML();
    // Should have IDs for both heading and paragraph
    const matches = html.match(new RegExp(BLOCK_ID_REGEX, "g"));
    expect(matches).toHaveLength(2);
  });

  it("should preserve existing block IDs when loading HTML", () => {
    const existingId = "deadbeef";
    const htmlWithId = `<p ${BLOCK_ID_ATTR}="${existingId}">Hello world</p>`;

    editor.commands.setContent(htmlWithId);

    const outputHtml = editor.getHTML();
    expect(outputHtml).toContain(`${BLOCK_ID_ATTR}="${existingId}"`);
  });

  it("should preserve block IDs through full app save/load cycle", () => {
    // Simulates the exact flow in AgentBuilderInstructionsEditor:
    // 1. Load from markdown (first time opening agent)
    // 2. Save with stripHtmlAttributes(getHTML())
    // 3. Reload saved HTML
    // 4. IDs should be preserved

    editor.commands.setContent("Hello world", {
      contentType: "markdown",
    });

    const savedHtml = stripHtmlAttributes(editor.getHTML());
    const originalId = savedHtml.match(BLOCK_ID_REGEX)![1];

    // Simulate page reload
    editor.destroy();
    editor = EditorFactory([BlockIdExtension]);
    editor.commands.setContent(savedHtml);

    const reloadedHtml = stripHtmlAttributes(editor.getHTML());
    const reloadedId = reloadedHtml.match(BLOCK_ID_REGEX)![1];

    expect(reloadedId).toBe(originalId);
  });
});
