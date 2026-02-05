import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

import { BlockIdExtension, computeBlockId } from "./BlockIdExtension";
import {
  getCommittedHtmlWithBlockIds,
  getCommittedTextContent,
  InstructionSuggestionExtension,
} from "./InstructionSuggestionExtension";

describe("InstructionSuggestionExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([InstructionSuggestionExtension, BlockIdExtension]);
  });

  afterEach(() => {
    editor.destroy();
  });

  describe("applySuggestion (block-based)", () => {
    it("should apply suggestion and track it in storage", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      // Block ID is computed from type and content hash.
      const targetBlockId = computeBlockId("paragraph", "Hello world");

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

      // Document should still have original content (no marks).
      const content = paragraph?.content as
        | Array<{ text?: string }>
        | undefined;
      expect(content?.length).toBe(1);
      expect(content?.[0]?.text).toBe("Hello world");

      // Suggestion should be tracked in storage.
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-suggestion-1");
    });

    it("should return false if block ID not found", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-2",
        targetBlockId: "paragraph-00000000",
        content: "<p>New content</p>",
      });

      expect(result).toBe(false);
    });

    it("should track suggestion in storage", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "test-suggestion-3",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-suggestion-3");
      expect(
        editor.storage.instructionSuggestion.activeSuggestions.has(
          "test-suggestion-3"
        )
      ).toBe(true);
    });

    it("should handle complete content replacement", () => {
      editor.commands.setContent("old content", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "old content");

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
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-suggestion-4");
    });

    it("should store HTML content as-is for later parsing", () => {
      editor.commands.setContent("Simple text", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Simple text");

      const result = editor.commands.applySuggestion({
        id: "test-html-storage",
        targetBlockId,
        content: "<h2>Heading text</h2>",
      });

      expect(result).toBe(true);

      // HTML is stored as-is, parsed during decoration building.
      const suggestion =
        editor.storage.instructionSuggestion.activeSuggestions.get(
          "test-html-storage"
        );
      expect(suggestion).toBeDefined();
      expect(suggestion?.newContent).toBe("<h2>Heading text</h2>");
    });
  });

  describe("applyLegacySuggestion (string-based)", () => {
    it("should apply legacy suggestion and track in storage", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applyLegacySuggestion({
        id: "test-legacy-1",
        find: "world",
        replacement: "there",
      });

      expect(result).toBe(true);

      // With pure decoration approach, document is unchanged.
      const json = editor.getJSON();
      const paragraph = json.content?.[0];
      expect(paragraph?.type).toBe("paragraph");

      // Document should still have original content.
      const text = editor.getText();
      expect(text).toBe("Hello world");

      // Suggestion should be tracked.
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-legacy-1");
    });

    it("should return false if find text not found", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applyLegacySuggestion({
        id: "test-legacy-2",
        find: "not found",
        replacement: "replacement",
      });

      expect(result).toBe(false);
    });

    it("should handle insertion (empty find)", () => {
      editor.commands.setContent("Hello", { contentType: "markdown" });

      const result = editor.commands.applyLegacySuggestion({
        id: "test-legacy-3",
        find: "",
        replacement: " world",
      });

      expect(result).toBe(true);

      // Document unchanged.
      const text = editor.getText();
      expect(text).toBe("Hello");

      // Suggestion tracked.
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-legacy-3");
    });

    it("should handle deletion (empty replacement)", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applyLegacySuggestion({
        id: "test-legacy-4",
        find: " world",
        replacement: "",
      });

      expect(result).toBe(true);

      // Document unchanged.
      const text = editor.getText();
      expect(text).toBe("Hello world");

      // Suggestion tracked.
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-legacy-4");
    });
  });

  describe("acceptSuggestion", () => {
    it("should replace content with new content on accept", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

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

    it("should remove suggestion ID from storage after accepting", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "test-accept-2",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-accept-2");

      editor.commands.acceptSuggestion("test-accept-2");

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).not.toContain("test-accept-2");
      expect(
        editor.storage.instructionSuggestion.activeSuggestions.has(
          "test-accept-2"
        )
      ).toBe(false);
    });
  });

  describe("rejectSuggestion", () => {
    it("should keep original content on reject", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

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

    it("should remove suggestion ID from storage after rejecting", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "test-reject-2",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-reject-2");

      editor.commands.rejectSuggestion("test-reject-2");

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).not.toContain("test-reject-2");
    });
  });

  describe("acceptAllSuggestions", () => {
    it("should accept all suggestions", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "all-1",
        targetBlockId,
        content: "<p>Hi there</p>",
      });

      editor.commands.acceptAllSuggestions();

      const text = editor.getText();
      expect(text).toContain("Hi");
      expect(text).toContain("there");

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toHaveLength(0);
    });

    it("should correctly map positions when accepting multiple suggestions", () => {
      // Create two paragraphs.
      editor.commands.setContent("First paragraph\n\nSecond paragraph", {
        contentType: "markdown",
      });

      const blockId1 = computeBlockId("paragraph", "First paragraph");
      const blockId2 = computeBlockId("paragraph", "Second paragraph");

      // Apply suggestions to both blocks.
      editor.commands.applySuggestion({
        id: "multi-1",
        targetBlockId: blockId1,
        content: "<p>Short</p>", // Shorter than original.
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
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "reject-all-1",
        targetBlockId,
        content: "<p>Hi there</p>",
      });

      editor.commands.rejectAllSuggestions();

      const text = editor.getText();
      expect(text).toContain("Hello");
      expect(text).toContain("world");

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toHaveLength(0);
    });
  });

  describe("getCommittedTextContent", () => {
    it("should return original text with pending suggestion", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "committed-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      // With pure decoration approach, committed content IS the document.
      const committed = getCommittedTextContent(editor);
      expect(committed).toContain("Hello");
      expect(committed).toContain("world");
    });

    it("should return full text when no suggestions applied", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const committed = getCommittedTextContent(editor);
      expect(committed).toContain("Hello world");
    });
  });

  describe("getCommittedHtmlWithBlockIds", () => {
    it("should return HTML with content-based block IDs", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const html = getCommittedHtmlWithBlockIds(editor);
      const expectedBlockId = computeBlockId("paragraph", "Hello world");
      // TipTap renders as data-blockid (lowercase, no hyphen).
      expect(html).toContain(`data-blockid="${expectedBlockId}"`);
      expect(html).toContain("Hello world");
    });

    it("should return original content in HTML with pending suggestion", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "html-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      // With pure decoration approach, HTML is unchanged.
      const html = getCommittedHtmlWithBlockIds(editor);
      expect(html).toContain("Hello");
      expect(html).toContain("world");
    });

    it("should render bullet lists with proper structure", () => {
      editor.commands.setContent("- Item one\n- Item two\n- Item three", {
        contentType: "markdown",
      });

      const html = getCommittedHtmlWithBlockIds(editor);

      // Should have ul wrapper.
      expect(html).toContain("<ul");
      expect(html).toContain("</ul>");

      // Should have li elements with block IDs.
      expect(html).toContain("<li");
      expect(html).toContain("data-blockid=");
      expect(html).toContain("Item one");
      expect(html).toContain("Item two");
      expect(html).toContain("Item three");
    });

    it("should render headings with proper tags", () => {
      editor.commands.setContent("# Heading One\n\nSome text", {
        contentType: "markdown",
      });

      const html = getCommittedHtmlWithBlockIds(editor);
      expect(html).toContain("<h1");
      expect(html).toContain("data-blockid=");
      expect(html).toContain("Heading One</h1>");
      expect(html).toContain("<p");
    });

    it("should generate stable IDs based on content", () => {
      // Create two paragraphs.
      editor.commands.setContent("First paragraph\n\nSecond paragraph", {
        contentType: "markdown",
      });

      const expectedId1 = computeBlockId("paragraph", "First paragraph");
      const expectedId2 = computeBlockId("paragraph", "Second paragraph");

      const html = getCommittedHtmlWithBlockIds(editor);
      expect(html).toContain(`data-blockid="${expectedId1}"`);
      expect(html).toContain(`data-blockid="${expectedId2}"`);

      // IDs should be deterministic - same content = same ID.
      expect(computeBlockId("paragraph", "First paragraph")).toBe(expectedId1);
    });
  });
});
