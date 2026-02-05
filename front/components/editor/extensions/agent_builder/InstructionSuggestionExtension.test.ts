import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BLOCK_ID_ATTRIBUTE,
  BlockIdExtension,
} from "@app/components/editor/extensions/agent_builder/BlockIdExtension";
import {
  getActiveSuggestionIds,
  getActiveSuggestions,
  InstructionSuggestionExtension,
} from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

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
    editor = EditorFactory([InstructionSuggestionExtension, BlockIdExtension]);
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
});
