import {
  BLOCK_ID_ATTRIBUTE,
  BlockIdExtension,
} from "@app/components/editor/extensions/agent_builder/BlockIdExtension";
import { InstructionBlockExtension } from "@app/components/editor/extensions/agent_builder/InstructionBlockExtension";
import type { BlockChange } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import {
  diffBlockContent,
  getActiveSuggestionIds,
  getActiveSuggestions,
  InstructionSuggestionExtension,
  SUGGESTION_ID_ATTRIBUTE,
} from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { InstructionsDocumentExtension } from "@app/components/editor/extensions/agent_builder/InstructionsDocumentExtension";
import { InstructionsRootExtension } from "@app/components/editor/extensions/agent_builder/InstructionsRootExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import { preprocessMarkdownForEditor } from "@app/components/editor/lib/preprocessMarkdownForEditor";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function getDeletions(editor: Editor) {
  return Array.from(
    editor.view.dom.querySelectorAll(".suggestion-deletion")
  ).map((el) => ({
    text: el.textContent,
    suggestionId: el.getAttribute(SUGGESTION_ID_ATTRIBUTE),
  }));
}

function getAdditions(editor: Editor) {
  return Array.from(
    editor.view.dom.querySelectorAll(".suggestion-addition")
  ).map((el) => ({
    text: el.textContent,
    suggestionId: el.getAttribute(SUGGESTION_ID_ATTRIBUTE),
  }));
}

function getBlockIds(editor: Editor): string[] {
  const ids: string[] = [];

  editor.state.doc.descendants((node) => {
    const id = node.attrs[BLOCK_ID_ATTRIBUTE];
    if (id) {
      ids.push(id);
    }
  });

  return ids;
}

describe("InstructionSuggestionExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory(
      [
        InstructionBlockExtension,
        InstructionSuggestionExtension,
        BlockIdExtension,
        ListItemExtension,
      ],
      { starterKit: { listItem: false } }
    );
  });

  afterEach(() => {
    editor.destroy();
  });

  describe("applySuggestion (block-based)", () => {
    it("should apply suggestion and track it in plugin state", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const [targetBlockId] = getBlockIds(editor);

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(result).toBe(true);

      // With pure decoration approach, document is unchanged.
      const json = editor.getJSON();
      const paragraph = json.content?.[0];
      expect(paragraph?.type).toBe("paragraph");

      const content = paragraph?.content as
        | Array<{ text?: string }>
        | undefined;
      expect(content?.length).toBe(1);
      expect(content?.[0]?.text).toBe("Hello world");

      // Suggestion should be tracked in plugin state.
      expect(getActiveSuggestionIds(editor.state)).toContain(
        "test-suggestion-1"
      );
    });

    it("should return false if block ID not found", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-2",
        targetBlockId: "nonexistent",
        content: "<p>New content</p>",
      });

      expect(result).toBe(false);
    });

    it("should track suggestion in plugin state", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "test-suggestion-3",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(getActiveSuggestionIds(editor.state)).toContain(
        "test-suggestion-3"
      );
      expect(getActiveSuggestions(editor.state).has("test-suggestion-3")).toBe(
        true
      );
    });

    it("should handle complete content replacement", () => {
      editor.commands.setContent("old content", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-4",
        targetBlockId,
        content: "<p>new content</p>",
      });

      expect(result).toBe(true);

      // Document unchanged with pure decoration approach.
      const text = editor.getText();
      expect(text).toBe("old content");

      // Suggestion tracked.
      expect(getActiveSuggestionIds(editor.state)).toContain(
        "test-suggestion-4"
      );
    });

    it("should store HTML content as-is for later parsing", () => {
      editor.commands.setContent("Simple text", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      const result = editor.commands.applySuggestion({
        id: "test-html-storage",
        targetBlockId,
        content: "<h2>Heading text</h2>",
      });

      expect(result).toBe(true);

      // HTML is stored as-is, parsed during decoration building.
      const suggestion = getActiveSuggestions(editor.state).get(
        "test-html-storage"
      );
      expect(suggestion).toBeDefined();
      expect(suggestion?.operations[0].newContent).toBe(
        "<h2>Heading text</h2>"
      );
    });
  });

  describe("acceptSuggestion", () => {
    it("should replace content with new content on accept", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "test-accept-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      const result = editor.commands.acceptSuggestion("test-accept-1");
      expect(result).toBe(true);

      // After accept, document should have new content.
      const text = editor.getText();
      expect(text).toBe("Hello there");
    });

    it("should remove suggestion from plugin state after accepting", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "test-accept-2",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(getActiveSuggestionIds(editor.state)).toContain("test-accept-2");

      editor.commands.acceptSuggestion("test-accept-2");

      expect(getActiveSuggestionIds(editor.state)).not.toContain(
        "test-accept-2"
      );
      expect(getActiveSuggestions(editor.state).has("test-accept-2")).toBe(
        false
      );
    });
  });

  describe("rejectSuggestion", () => {
    it("should keep original content on reject", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "test-reject-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      const result = editor.commands.rejectSuggestion("test-reject-1");
      expect(result).toBe(true);

      // After reject, document should still have original content.
      const text = editor.getText();
      expect(text).toBe("Hello world");
    });

    it("should remove suggestion from plugin state after rejecting", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "test-reject-2",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(getActiveSuggestionIds(editor.state)).toContain("test-reject-2");

      editor.commands.rejectSuggestion("test-reject-2");

      expect(getActiveSuggestionIds(editor.state)).not.toContain(
        "test-reject-2"
      );
    });
  });

  describe("acceptAllSuggestions", () => {
    it("should accept all suggestions", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "all-1",
        targetBlockId,
        content: "<p>Hi there</p>",
      });

      editor.commands.acceptAllSuggestions();

      const text = editor.getText();
      expect(text).toContain("Hi");
      expect(text).toContain("there");

      expect(getActiveSuggestionIds(editor.state)).toHaveLength(0);
    });

    it("should correctly map positions when accepting multiple suggestions", () => {
      // Create two paragraphs.
      editor.commands.setContent("First paragraph\n\nSecond paragraph", {
        contentType: "markdown",
      });

      const [blockId1, blockId2] = getBlockIds(editor);

      // Apply suggestions to both blocks.
      editor.commands.applySuggestion({
        id: "multi-1",
        targetBlockId: blockId1,
        content: "<p>Short</p>",
      });

      editor.commands.applySuggestion({
        id: "multi-2",
        targetBlockId: blockId2,
        content: "<p>New second</p>",
      });

      // Accept first suggestion (this changes document positions).
      editor.commands.acceptSuggestion("multi-1");

      // Second suggestion should still work after position shift.
      editor.commands.acceptSuggestion("multi-2");

      const text = editor.getText();
      expect(text).toContain("Short");
      expect(text).toContain("New second");
      expect(text).not.toContain("First paragraph");
      expect(text).not.toContain("Second paragraph");
    });
  });

  describe("rejectAllSuggestions", () => {
    it("should reject all suggestions and keep original text", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "reject-all-1",
        targetBlockId,
        content: "<p>Hi there</p>",
      });

      editor.commands.rejectAllSuggestions();

      const text = editor.getText();
      expect(text).toContain("Hello");
      expect(text).toContain("world");

      expect(getActiveSuggestionIds(editor.state)).toHaveLength(0);
    });
  });

  describe("decorations", () => {
    it("should render deletion decoration on replaced text", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "deco-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      const deletions = getDeletions(editor);
      expect(deletions).toHaveLength(1);
      expect(deletions[0].text).toBe("world");
      expect(deletions[0].suggestionId).toBe("deco-1");
    });

    it("should render addition widget with new text", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "deco-2",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      const additions = getAdditions(editor);
      expect(additions).toHaveLength(1);
      expect(additions[0].text).toBe("there");
      expect(additions[0].suggestionId).toBe("deco-2");
    });

    it("should render deletion without addition for pure removal", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "deco-3",
        targetBlockId,
        content: "<p>Hello</p>",
      });

      const deletions = getDeletions(editor);
      expect(deletions).toHaveLength(1);
      expect(deletions[0].text).toBe(" world");

      expect(getAdditions(editor)).toHaveLength(0);
    });

    it("should render addition without deletion for pure insertion", () => {
      editor.commands.setContent("Hello", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "deco-4",
        targetBlockId,
        content: "<p>Hello world</p>",
      });

      expect(getDeletions(editor)).toHaveLength(0);

      const additions = getAdditions(editor);
      expect(additions).toHaveLength(1);
      expect(additions[0].text).toBe(" world");
    });

    it("should render decorations for multiple suggestions on different blocks", () => {
      editor.commands.setContent("First line\n\nSecond line", {
        contentType: "markdown",
      });
      const [blockId1, blockId2] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "deco-multi-1",
        targetBlockId: blockId1,
        content: "<p>Changed first</p>",
      });

      editor.commands.applySuggestion({
        id: "deco-multi-2",
        targetBlockId: blockId2,
        content: "<p>Changed second</p>",
      });

      const deletions = getDeletions(editor);
      const additions = getAdditions(editor);

      // Each suggestion should produce at least one deletion and one addition.
      expect(deletions.length).toBeGreaterThanOrEqual(2);
      expect(additions.length).toBeGreaterThanOrEqual(2);

      const deletionIds = deletions.map((d) => d.suggestionId);
      expect(deletionIds).toContain("deco-multi-1");
      expect(deletionIds).toContain("deco-multi-2");

      const additionIds = additions.map((a) => a.suggestionId);
      expect(additionIds).toContain("deco-multi-1");
      expect(additionIds).toContain("deco-multi-2");
    });

    it("should remove decorations after accepting a suggestion", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "deco-accept",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(getDeletions(editor)).toHaveLength(1);
      expect(getAdditions(editor)).toHaveLength(1);

      editor.commands.acceptSuggestion("deco-accept");

      expect(getDeletions(editor)).toHaveLength(0);
      expect(getAdditions(editor)).toHaveLength(0);
    });

    it("should remove decorations after rejecting a suggestion", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "deco-reject",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(getDeletions(editor)).toHaveLength(1);
      expect(getAdditions(editor)).toHaveLength(1);

      editor.commands.rejectSuggestion("deco-reject");

      expect(getDeletions(editor)).toHaveLength(0);
      expect(getAdditions(editor)).toHaveLength(0);
    });

    it("should use dimmed classes by default and highlighted classes when highlighted", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const [targetBlockId] = getBlockIds(editor);

      editor.commands.applySuggestion({
        id: "deco-highlight",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      // Default: dimmed classes (no suggestion is highlighted).
      const dimmedDeletion = editor.view.dom.querySelector(
        ".suggestion-deletion"
      );
      expect(dimmedDeletion?.className).toContain("bg-red-50");

      const dimmedAddition = editor.view.dom.querySelector(
        ".suggestion-addition"
      );
      expect(dimmedAddition?.className).toContain("bg-blue-50");

      // Highlight the suggestion.
      editor.commands.setHighlightedSuggestion("deco-highlight");

      const highlightedDeletion = editor.view.dom.querySelector(
        ".suggestion-deletion"
      );
      expect(highlightedDeletion?.className).toContain("bg-red-100");

      const highlightedAddition = editor.view.dom.querySelector(
        ".suggestion-addition"
      );
      expect(highlightedAddition?.className).toContain("bg-blue-100");
    });

    it("should render multiple deletion/addition pairs for disjoint changes in one block", () => {
      editor.commands.setContent("Hello world goodbye", {
        contentType: "markdown",
      });
      const [targetBlockId] = getBlockIds(editor);

      // "Hello world goodbye" → "Hi world bye":
      // Change 1: "ello" → "i" (shared prefix "H")
      // Change 2: "good" deleted (shared suffix "bye")
      editor.commands.applySuggestion({
        id: "deco-multi-change",
        targetBlockId,
        content: "<p>Hi world bye</p>",
      });

      const deletions = getDeletions(editor);
      expect(deletions).toHaveLength(2);
      expect(deletions[0].text).toBe("ello");
      expect(deletions[0].suggestionId).toBe("deco-multi-change");
      expect(deletions[1].text).toBe("good");
      expect(deletions[1].suggestionId).toBe("deco-multi-change");

      const additions = getAdditions(editor);
      expect(additions).toHaveLength(1);
      expect(additions[0].text).toBe("i");
      expect(additions[0].suggestionId).toBe("deco-multi-change");
    });
  });

  describe("markdown parsing resilience", () => {
    it("should handle angle-bracketed non-HTML tokens like <URL>", () => {
      const escaped = preprocessMarkdownForEditor("Test <URL>");
      expect(() => {
        editor.commands.setContent(escaped, { contentType: "markdown" });
      }).not.toThrow();
      expect(editor.getText().trim()).toContain("Test");
      expect(editor.getText().trim()).toContain("URL");
    });

    it("should handle multiple inline unrecognized tags", () => {
      const escaped = preprocessMarkdownForEditor(
        "Use <URL> and <PLACEHOLDER> here"
      );
      expect(() => {
        editor.commands.setContent(escaped, { contentType: "markdown" });
      }).not.toThrow();

      expect(escaped).toBe("Use <\u200BURL> and <\u200BPLACEHOLDER> here");
    });

    it("should escape HTML comments so content after is preserved", () => {
      const markdown = "Hello\n\n<!-- Comment -->\n\nEverything here gets lost";
      const escaped = preprocessMarkdownForEditor(markdown);

      // All < escaped; comment start becomes <ZWS!--
      expect(escaped).toContain("\u200B!--");

      // Editor parses without losing content
      editor.commands.setContent(escaped, { contentType: "markdown" });
      const text = editor.getText();
      expect(text).toContain("Hello");
      expect(text).toContain("Everything here gets lost");
    });

    it("should not collapse between HTML comment and following instruction block", () => {
      const markdown = "<!-- test -->\n\n<foo>\nhello\n</foo>";
      const escaped = preprocessMarkdownForEditor(markdown);

      // Comment stays escaped; <foo> is on its own line and gets un-escaped
      expect(escaped).toContain("\u200B!-- test -->");
      expect(escaped).toContain("<foo>");
      expect(escaped).toContain("</foo>");
      expect(escaped).not.toContain("--><foo>");

      editor.commands.setContent(escaped, { contentType: "markdown" });
      expect(editor.getText()).toContain("hello");
    });

    it("should escape inline unmatched HTML tags with zero-width space", () => {
      const escaped = preprocessMarkdownForEditor("Test <p> and <code>");
      expect(escaped).toBe("Test <\u200Bp> and <\u200Bcode>");
    });

    it("should escape inline unrecognized tags with zero-width space", () => {
      const escaped = preprocessMarkdownForEditor("Test <URL>");
      expect(escaped).toBe("Test <\u200BURL>");
    });

    it("should escape tags whose first word matches TAG_NAME_PATTERN even with spaces", () => {
      const escaped = preprocessMarkdownForEditor(
        "Example: <Prompt Good Practices>\nSome content here"
      );
      expect(escaped).toBe(
        "Example: <\u200BPrompt Good Practices>\nSome content here"
      );
    });

    it("should escape inline instruction block examples with zero-width space", () => {
      const escaped = preprocessMarkdownForEditor(
        "Example: <do>Provide a concise summary</do> <don't>Include opinions</don't>"
      );
      expect(escaped).toBe(
        "Example: <\u200Bdo>Provide a concise summary<\u200B/do> <\u200Bdon't>Include opinions<\u200B/don't>"
      );
    });

    it("should preserve block-level instruction blocks but escape inline ones", () => {
      const markdown = [
        "Use these tags:",
        "",
        "<rules>",
        "Follow these rules",
        "</rules>",
        "",
        "But Example: <do>this</do> is inline",
      ].join("\n");
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("<rules>");
      expect(escaped).toContain("</rules>");
      expect(escaped).toContain("<\u200Bdo>");
      expect(escaped).toContain(
        "But Example: <\u200Bdo>this<\u200B/do> is inline"
      );
    });

    it("should preserve nested different-tag blocks", () => {
      const markdown = [
        "<rules>",
        "Outer content",
        "<do>Follow this</do>",
        "</rules>",
      ].join("\n");
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).not.toContain("\u200Brules");
      expect(escaped).not.toContain("\u200Bdo");
      expect(escaped).toContain("<rules>");
      expect(escaped).toContain("<do>");
      expect(escaped).toContain("</do>");
      expect(escaped).toContain("</rules>");
    });

    it("should preserve nested same-tag blocks", () => {
      const markdown = [
        "<rules>",
        "Outer content",
        "<rules>",
        "Inner content",
        "</rules>",
        "</rules>",
      ].join("\n");
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).not.toContain("\u200Brules");
      expect(escaped).not.toContain("\u200B/rules");
      expect(escaped).toContain("<rules>");
      expect(escaped).toContain("</rules>");
    });

    it("should preserve nested indented blocks", () => {
      const markdown = "<agent>\n  <bar>\n    hello\n  </bar>\n</agent>";
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("<agent>");
      expect(escaped).toContain("<bar>");

      editor.commands.setContent(escaped, { contentType: "markdown" });
      expect(editor.getText()).toContain("hello");
    });

    it("should handle triple nesting with mixed indentation", () => {
      const markdown =
        "<agent>\n\t<bar>\n  \t\t<baz>\n    nested\n  \t\t</baz>\n\t</bar>\n</agent>";
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("<agent>");
      expect(escaped).toContain("<bar>");
      expect(escaped).toContain("<baz>");

      editor.commands.setContent(escaped, { contentType: "markdown" });
      expect(editor.getText()).toContain("nested");
    });

    it("should handle adjacent nested blocks at same level", () => {
      const markdown =
        "<agent>\n  <bar>first</bar>\n  <baz>second</baz>\n</agent>";
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("<agent>");
      expect(escaped).toContain("<bar>");
      expect(escaped).toContain("<baz>");

      editor.commands.setContent(escaped, { contentType: "markdown" });
      expect(editor.getText()).toContain("first");
      expect(editor.getText()).toContain("second");
    });

    it("should un-escape single-line nested blocks (same as collapsed)", () => {
      const markdown = "<agent><bar>hello</bar></agent>";
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("<agent>");
      expect(escaped).toContain("<bar>");
      expect(escaped).toContain("</bar>");
      expect(escaped).toContain("</agent>");

      editor.commands.setContent(escaped, { contentType: "markdown" });
      expect(editor.getText()).toContain("hello");
    });

    it("should handle closing tag with trailing spaces before newline", () => {
      const markdown = "<agent>\n  <bar>hi</bar>   \n</agent>";
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("<agent>");
      expect(escaped).toContain("<bar>");
      expect(escaped).toContain("</bar>");
      expect(escaped).toContain("</agent>");

      editor.commands.setContent(escaped, { contentType: "markdown" });
      expect(editor.getText()).toContain("hi");
    });

    it("should handle document starting with newlines before instruction block", () => {
      const markdown = "\n\n<agent>\n  <bar>x</bar>\n</agent>";
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("<agent>");
      expect(escaped).toContain("<bar>");

      editor.commands.setContent(escaped, { contentType: "markdown" });
      expect(editor.getText()).toContain("x");
    });

    it("should escape processing instructions (general fallback)", () => {
      const escaped = preprocessMarkdownForEditor(
        '<?xml version="1.0"?>\nSome content'
      );
      expect(escaped).toContain("\u200B?");
      expect(escaped).toContain("Some content");
    });

    it("should escape invalid tag names (general fallback)", () => {
      const escaped = preprocessMarkdownForEditor("Use <1> or <_private>");
      expect(escaped).toContain("\u200B");
    });

    it("should escape orphan closing tag when count is already zero", () => {
      const markdown = ["<rules>", "Content", "</rules>", "</rules>"].join(
        "\n"
      );
      const escaped = preprocessMarkdownForEditor(markdown);
      expect(escaped).toContain("<\u200B/rules>");
    });

    it("should escape block-level tags with attributes", () => {
      const markdown = ['<rules id="test">', "Some content", "</rules>"].join(
        "\n"
      );
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain('<\u200Brules id="test">');
      expect(escaped).toContain("<\u200B/rules>");
    });

    it("should escape inline HTML formatting examples", () => {
      const escaped = preprocessMarkdownForEditor(
        "- Use <strong>bold</strong> for emphasis\n- Use <ul><li> for lists"
      );
      expect(escaped).toBe(
        "- Use <\u200Bstrong>bold<\u200B/strong> for emphasis\n- Use <\u200Bul><\u200Bli> for lists"
      );
    });

    it("should escape inline self-closing tags", () => {
      const escaped = preprocessMarkdownForEditor(
        'Line 1<br>Line 2\n\nImage: <img src="test.jpg" />'
      );
      expect(escaped).toBe(
        'Line 1<\u200Bbr>Line 2\n\nImage: <\u200Bimg src="test.jpg" />'
      );
    });

    it("should escape unmatched tags regardless of position (matching only)", () => {
      const markdown = "Paragraph\n\n<br>\nMore text";
      const escaped = preprocessMarkdownForEditor(markdown);
      expect(escaped).toContain("\u200Bbr");
    });

    it("should preserve block-level recognized tags", () => {
      const markdown = "\n<p>\nSome paragraph\n</p>";
      const escaped = preprocessMarkdownForEditor(markdown);
      expect(escaped).toContain("\n\n<p>");
      expect(escaped).toContain("</p>");
    });

    it("should not double-escape when ZWS already present (round-trip safe)", () => {
      const once = preprocessMarkdownForEditor("Test <URL>");
      expect(once).toBe("Test <\u200BURL>");

      const twice = preprocessMarkdownForEditor(once);
      expect(twice).toBe(once);
    });

    it("should remain idempotent after multiple passes", () => {
      const input = "Use <URL> and <PLACEHOLDER> here";
      let result = preprocessMarkdownForEditor(input);
      for (let i = 0; i < 3; i++) {
        result = preprocessMarkdownForEditor(result);
      }
      expect(result).toBe("Use <\u200BURL> and <\u200BPLACEHOLDER> here");
    });

    it("should preserve whitespace and newlines in content", () => {
      const markdown = [
        "  leading spaces",
        "",
        "<rules>",
        "  indented",
        "",
        "  more",
        "</rules>",
      ].join("\n");
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("  leading spaces");
      expect(escaped).toContain("  indented");
      expect(escaped).toContain("  more");
      expect(escaped).toContain("<rules>");
      expect(escaped).toContain("</rules>");
    });

    it("should preserve blank lines inside instruction blocks", () => {
      const markdown = [
        "<rules>",
        "line one",
        "",
        "line two",
        "",
        "",
        "line three",
        "</rules>",
      ].join("\n");
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("line one\n\nline two");
      expect(escaped).toContain("line two\n\n\nline three");
    });

    it("should preserve trailing whitespace and tabs in content", () => {
      const markdown = [
        "<rules>",
        "line with trailing   ",
        "\tindented with tab",
        "</rules>",
      ].join("\n");
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("line with trailing   ");
      expect(escaped).toContain("\tindented with tab");
    });

    it("should not strip existing blank lines around instruction blocks", () => {
      const markdown = "Hello\n\n<rules>\ncontent\n</rules>\n\nMore text";
      const escaped = preprocessMarkdownForEditor(markdown);

      expect(escaped).toContain("\n\n<rules>");
      expect(escaped).toContain("</rules>\n\n");
      expect(escaped).toContain("More text");
    });
  });

  describe("markdown preprocessing for instruction blocks", () => {
    it("should parse instruction block preceded by single newline", () => {
      editor.commands.setContent(
        preprocessMarkdownForEditor(
          "You are an expert\n<CRITICAL_INFORMATION>TEST</CRITICAL_INFORMATION>"
        ),
        { contentType: "markdown" }
      );

      const json = editor.getJSON();
      const blocks = json.content?.filter((n) => n.type === "instructionBlock");
      expect(blocks).toHaveLength(1);
      expect(blocks![0].attrs!.type).toBe("critical_information");
    });

    it("should preserve text before instruction block", () => {
      editor.commands.setContent(
        preprocessMarkdownForEditor(
          "You are an expert\n<rules>\nDo this\n</rules>"
        ),
        { contentType: "markdown" }
      );

      const json = editor.getJSON();
      const paragraph = json.content?.find((n) => n.type === "paragraph");
      expect(paragraph?.type).toBe("paragraph");

      const content = paragraph?.content as
        | Array<{ text?: string }>
        | undefined;
      expect(content?.length).toBe(1);
      expect(content?.[0]?.text).toBe("You are an expert");
    });

    it("should handle tag names with underscores", () => {
      editor.commands.setContent(
        preprocessMarkdownForEditor(
          "Hello\n<MY_CUSTOM_TAG>\ncontent\n</MY_CUSTOM_TAG>"
        ),
        { contentType: "markdown" }
      );

      const blocks = editor
        .getJSON()
        .content?.filter((n: any) => n.type === "instructionBlock");
      expect(blocks).toHaveLength(1);
      expect(blocks![0].attrs!.type).toBe("my_custom_tag");
    });

    it("should not double-add newlines when already present", () => {
      editor.commands.setContent(
        preprocessMarkdownForEditor("Hello\n\n<rules>\ncontent\n</rules>"),
        { contentType: "markdown" }
      );

      const blocks = editor
        .getJSON()
        .content?.filter((n: any) => n.type === "instructionBlock");
      expect(blocks).toHaveLength(1);
    });

    it("should escape standalone unrecognized tags", () => {
      editor.commands.setContent(
        preprocessMarkdownForEditor("Use <URL> for links"),
        { contentType: "markdown" }
      );

      const text = editor.getText();
      expect(text).toContain("URL");
      const blocks = editor
        .getJSON()
        .content?.filter((n: any) => n.type === "instructionBlock");
      expect(blocks).toHaveLength(0);
    });

    it("should round-trip instruction blocks through markdown", () => {
      const input =
        "You are an expert\n<CRITICAL_INFORMATION>\n@\n</CRITICAL_INFORMATION>";
      editor.commands.setContent(preprocessMarkdownForEditor(input), {
        contentType: "markdown",
      });

      const markdown = editor.getMarkdown();
      expect(markdown).toContain("<critical_information>");
      expect(markdown).toContain("</critical_information>");
      expect(markdown).toContain("@");
    });
  });

  describe("diffBlockContent", () => {
    function makeParagraph(text: string) {
      const { schema } = editor.state;
      return schema.node("paragraph", null, [schema.text(text)]);
    }

    function diff(oldText: string, newText: string): BlockChange[] {
      return diffBlockContent(
        makeParagraph(oldText),
        makeParagraph(newText),
        editor.state.schema
      );
    }

    it("should detect suffix replacement", () => {
      const changes = diff("Hello world", "Hello there");
      expect(changes).toEqual([{ fromA: 6, toA: 11, fromB: 6, toB: 11 }]);
    });

    it("should detect prefix replacement", () => {
      // "Hello world" → "Hi world": common prefix "H", common suffix " world".
      const changes = diff("Hello world", "Hi world");
      expect(changes).toEqual([{ fromA: 1, toA: 5, fromB: 1, toB: 2 }]);
    });

    it("should detect two disjoint changes", () => {
      // "Hello world goodbye" → "Hi world bye": "H" shared prefix, "ello"→"i";
      // "goodbye" → "bye": shared suffix "bye", so "good" is deleted.
      const changes = diff("Hello world goodbye", "Hi world bye");
      expect(changes).toHaveLength(2);
      expect(changes[0]).toEqual({ fromA: 1, toA: 5, fromB: 1, toB: 2 });
      expect(changes[1]).toEqual({ fromA: 12, toA: 16, fromB: 9, toB: 9 });
    });

    it("should detect full replacement", () => {
      const changes = diff("old", "new");
      expect(changes).toEqual([{ fromA: 0, toA: 3, fromB: 0, toB: 3 }]);
    });

    it("should return empty array for identical content", () => {
      const changes = diff("same", "same");
      expect(changes).toEqual([]);
    });

    it("should detect pure insertion", () => {
      const changes = diff("ab", "aXb");
      expect(changes).toEqual([{ fromA: 1, toA: 1, fromB: 1, toB: 2 }]);
    });

    it("should detect pure deletion", () => {
      const changes = diff("aXb", "ab");
      expect(changes).toEqual([{ fromA: 1, toA: 2, fromB: 1, toB: 1 }]);
    });

    it("should handle empty old node as full addition", () => {
      const { schema } = editor.state;
      const emptyNode = schema.node("paragraph", null);
      const newNode = makeParagraph("new content");

      const changes = diffBlockContent(emptyNode, newNode, schema);
      expect(changes).toEqual([
        { fromA: 0, toA: 0, fromB: 0, toB: newNode.content.size },
      ]);
    });
  });

  describe("nested list marker parsing (ListItemExtension)", () => {
    it("should not throw on consecutive bullet markers: '- - text'", () => {
      expect(() => {
        editor.commands.setContent("- - Clearly indicate the source", {
          contentType: "markdown",
        });
      }).not.toThrow();
    });

    it("should not throw on ordered list inside bullet: '- 1. Hello'", () => {
      expect(() => {
        editor.commands.setContent("- 1. Hello\nWorld", {
          contentType: "markdown",
        });
      }).not.toThrow();

      expect(editor.getText()).toContain("Hello");
      expect(editor.getText()).toContain("World");
    });

    it("should preserve the nested content text", () => {
      editor.commands.setContent("- - Clearly indicate the source", {
        contentType: "markdown",
      });

      const text = editor.getText();
      expect(text).toContain("Clearly indicate the source");
    });

    it("should handle mixed valid and nested markers", () => {
      const markdown = [
        "3. Data Analysis and Presentation:",
        "- - Clearly indicate the source origin for all information.",
        "- Format key metrics as follows:",
      ].join("\n");

      expect(() => {
        editor.commands.setContent(markdown, { contentType: "markdown" });
      }).not.toThrow();

      const text = editor.getText();
      expect(text).toContain("Clearly indicate the source");
      expect(text).toContain("Format key metrics");
    });

    it("should handle triple nested markers: '- - - text'", () => {
      expect(() => {
        editor.commands.setContent("- - - deeply nested", {
          contentType: "markdown",
        });
      }).not.toThrow();

      expect(editor.getText()).toContain("deeply nested");
    });
  });
});

describe("Root-targeting suggestions", () => {
  let editor: Editor;

  function getRootEditor() {
    return EditorFactory(
      [
        InstructionsDocumentExtension,
        InstructionsRootExtension,
        InstructionSuggestionExtension,
        BlockIdExtension,
      ],
      { starterKit: { document: false } }
    );
  }

  function getDeletions() {
    return Array.from(
      editor.view.dom.querySelectorAll(".suggestion-deletion")
    ).map((el) => ({
      text: el.textContent,
      suggestionId: el.getAttribute(SUGGESTION_ID_ATTRIBUTE),
    }));
  }

  function getAdditions() {
    return Array.from(
      editor.view.dom.querySelectorAll(".suggestion-addition")
    ).map((el) => ({
      text: el.textContent,
      suggestionId: el.getAttribute(SUGGESTION_ID_ATTRIBUTE),
    }));
  }

  beforeEach(() => {
    editor = getRootEditor();
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should find the instructionsRoot node by its block-id", () => {
    editor.commands.setContent("Hello", { contentType: "markdown" });

    const ids: string[] = [];
    editor.state.doc.descendants((node) => {
      const id = node.attrs[BLOCK_ID_ATTRIBUTE];
      if (id) {
        ids.push(id);
      }
    });

    expect(ids).toContain(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID);
  });

  it("should apply a suggestion targeting the root node", () => {
    editor.commands.setContent("Original content", {
      contentType: "markdown",
    });

    const result = editor.commands.applySuggestion({
      id: "root-1",
      targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
      content: `<div data-type="instructions-root"><p>Replaced content</p></div>`,
    });

    expect(result).toBe(true);
    expect(getActiveSuggestionIds(editor.state)).toContain("root-1");
    // Document unchanged (decoration-only).
    expect(editor.getText()).toContain("Original content");
  });

  it("should show diff decorations when targeting root", () => {
    editor.commands.setContent("Old text", { contentType: "markdown" });

    editor.commands.applySuggestion({
      id: "root-diff",
      targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
      content: `<div data-type="instructions-root"><p>New text</p></div>`,
    });

    const deletions = getDeletions();
    const additions = getAdditions();

    expect(deletions.length).toBeGreaterThanOrEqual(1);
    expect(additions.length).toBeGreaterThanOrEqual(1);
    expect(deletions[0].suggestionId).toBe("root-diff");
    expect(additions[0].suggestionId).toBe("root-diff");
  });

  it("should accept a root-targeting suggestion and replace all content", () => {
    editor.commands.setContent("Before", { contentType: "markdown" });

    editor.commands.applySuggestion({
      id: "root-accept",
      targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
      content: `<div data-type="instructions-root"><p>After</p></div>`,
    });

    editor.commands.acceptSuggestion("root-accept");

    expect(editor.getText()).toContain("After");
    expect(editor.getText()).not.toContain("Before");
    expect(getActiveSuggestionIds(editor.state)).toHaveLength(0);
  });

  it("should reject a root-targeting suggestion and keep original content", () => {
    editor.commands.setContent("Keep me", { contentType: "markdown" });

    editor.commands.applySuggestion({
      id: "root-reject",
      targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
      content: `<div data-type="instructions-root"><p>Nope</p></div>`,
    });

    editor.commands.rejectSuggestion("root-reject");

    expect(editor.getText()).toContain("Keep me");
    expect(getActiveSuggestionIds(editor.state)).toHaveLength(0);
  });

  it("should diff non-root blocks without RangeError in root-constrained schema", () => {
    // Set content with a bullet list so we get a bulletList node.
    editor.commands.setContent("- Item one\n- Item two", {
      contentType: "markdown",
    });

    // Find the bulletList node.
    let bulletNode: ReturnType<typeof editor.state.doc.nodeAt> = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "bulletList") {
        bulletNode = node;
        return false;
      }
      return true;
    });

    expect(bulletNode).not.toBeNull();

    const schema = editor.state.schema;
    const newBulletNode = schema.node(
      "bulletList",
      (bulletNode as unknown as PMNode).attrs,
      [
        schema.node("listItem", null, [
          schema.node("paragraph", null, [schema.text("Changed item")]),
        ]),
        schema.node("listItem", null, [
          schema.node("paragraph", null, [schema.text("Item two")]),
        ]),
      ]
    );

    // If not adding the root wrapper, diffing a non-root block would throw a
    // RangeError: Invalid content for node doc.
    expect(() => {
      diffBlockContent(bulletNode as unknown as PMNode, newBulletNode, schema);
    }).not.toThrow();

    const changes = diffBlockContent(
      bulletNode as unknown as PMNode,
      newBulletNode,
      schema
    );
    expect(changes.length).toBeGreaterThanOrEqual(1);
  });

  describe("parseHTMLToBlock", () => {
    it("should show decorations for a child paragraph suggestion", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      // Find the paragraph's block-id (not the instructionsRoot).
      const ids = getBlockIds(editor);
      const paragraphBlockId = ids.find(
        (id) => id !== INSTRUCTIONS_ROOT_TARGET_BLOCK_ID
      );
      expect(paragraphBlockId).toBeDefined();

      // In the root-constrained schema, parsing "<p>Hello there</p>" produces
      // doc > instructionsRoot > paragraph. parseHTMLToBlock must recursively
      // unwrap instructionsRoot to find the paragraph node.
      const result = editor.commands.applySuggestion({
        id: "child-para-deco",
        targetBlockId: paragraphBlockId!,
        content: "<p>Hello there</p>",
      });

      expect(result).toBe(true);

      // Document unchanged (decoration-only).
      expect(editor.getText()).toContain("Hello world");

      const deletions = getDeletions();
      expect(deletions).toHaveLength(1);
      expect(deletions[0].text).toBe("world");
      expect(deletions[0].suggestionId).toBe("child-para-deco");

      const additions = getAdditions();
      expect(additions).toHaveLength(1);
      expect(additions[0].text).toBe("there");
      expect(additions[0].suggestionId).toBe("child-para-deco");
    });

    it("should accept a child paragraph suggestion", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const ids = getBlockIds(editor);
      const paragraphBlockId = ids.find(
        (id) => id !== INSTRUCTIONS_ROOT_TARGET_BLOCK_ID
      );
      expect(paragraphBlockId).toBeDefined();

      editor.commands.applySuggestion({
        id: "child-para-accept",
        targetBlockId: paragraphBlockId!,
        content: "<p>Hello there</p>",
      });

      editor.commands.acceptSuggestion("child-para-accept");

      expect(editor.getText()).toContain("Hello there");
      expect(editor.getText()).not.toContain("world");
      expect(getActiveSuggestionIds(editor.state)).toHaveLength(0);
    });

    it("should show decorations for a bullet list suggestion targeting root", () => {
      editor.commands.setContent("- Item one\n- Item two", {
        contentType: "markdown",
      });

      // bulletList nodes don't get block-ids, so target the root which
      // wraps them. parseHTMLToBlock must still recursively find the
      // instructionsRoot inside the parsed result.
      editor.commands.applySuggestion({
        id: "child-bullet-deco",
        targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
        content: `<div data-type="instructions-root"><ul><li><p>Changed item</p></li><li><p>Item two</p></li></ul></div>`,
      });

      expect(getActiveSuggestionIds(editor.state)).toContain(
        "child-bullet-deco"
      );

      const deletions = getDeletions();
      const additions = getAdditions();

      // "Item one" → "Changed item": should produce at least one deletion and one addition.
      expect(deletions.length).toBeGreaterThanOrEqual(1);
      expect(additions.length).toBeGreaterThanOrEqual(1);
      expect(deletions[0].suggestionId).toBe("child-bullet-deco");
      expect(additions[0].suggestionId).toBe("child-bullet-deco");
    });
  });
});
