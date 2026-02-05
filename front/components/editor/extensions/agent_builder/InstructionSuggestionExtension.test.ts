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
    it("should apply suggestion with word-level diffs", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      // Block ID is computed from type and content hash.
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      expect(result).toBe(true);

      const json = editor.getJSON();
      const paragraph = json.content?.[0];
      expect(paragraph?.type).toBe("paragraph");

      // Should have word-level diff: "Hello " (unchanged) + "world" (deletion) + "there" (addition).
      const content = paragraph?.content;
      expect(content?.length).toBeGreaterThanOrEqual(2);

      // Check for deletion mark on "world".
      const deletionNode = content?.find(
        (node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some((m) => m.type === "suggestionDeletion")
      );
      expect(deletionNode).toBeDefined();

      // Check for addition mark on "there".
      const additionNode = content?.find(
        (node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some((m) => m.type === "suggestionAddition")
      );
      expect(additionNode).toBeDefined();
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

      const json = editor.getJSON();
      const content = json.content?.[0]?.content;

      // Should have deletion + addition.
      expect(
        content?.some((node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some((m) => m.type === "suggestionDeletion")
        )
      ).toBe(true);

      expect(
        content?.some((node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some((m) => m.type === "suggestionAddition")
        )
      ).toBe(true);
    });

    it("should extract text from HTML content", () => {
      editor.commands.setContent("Simple text", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Simple text");

      const result = editor.commands.applySuggestion({
        id: "test-html-extraction",
        targetBlockId,
        content: "<h2>Heading text</h2>",
      });

      expect(result).toBe(true);

      // The text content should be extracted from the HTML.
      const json = editor.getJSON();
      const paragraph = json.content?.[0];

      // Check that diffs were computed correctly.
      const additionNode = paragraph?.content?.find(
        (node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some((m) => m.type === "suggestionAddition")
      );
      expect(additionNode).toBeDefined();
    });
  });

  describe("applyLegacySuggestion (string-based)", () => {
    it("should apply suggestion with deletion and addition marks", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applyLegacySuggestion({
        id: "test-legacy-1",
        find: "world",
        replacement: "there",
      });

      expect(result).toBe(true);

      const json = editor.getJSON();
      const paragraph = json.content?.[0];
      expect(paragraph?.type).toBe("paragraph");

      // Should have: "Hello " + "world" (deletion) + "there" (addition).
      const content = paragraph?.content as Array<{
        text?: string;
        marks?: Array<{ type: string }>;
      }>;
      expect(content).toHaveLength(3);

      // Plain text "Hello ".
      expect(content?.[0]?.text).toBe("Hello ");

      // Deletion mark on "world".
      expect(content?.[1]?.text).toBe("world");
      expect(content?.[1]?.marks?.[0]?.type).toBe("suggestionDeletion");

      // Addition mark on "there".
      expect(content?.[2]?.text).toBe("there");
      expect(content?.[2]?.marks?.[0]?.type).toBe("suggestionAddition");
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

      const json = editor.getJSON();
      const content = json.content?.[0]?.content;

      const additionNode = content?.find(
        (node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some((m) => m.type === "suggestionAddition")
      );
      expect(additionNode).toMatchObject({ text: " world" });
    });

    it("should handle deletion (empty replacement)", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applyLegacySuggestion({
        id: "test-legacy-4",
        find: " world",
        replacement: "",
      });

      expect(result).toBe(true);

      const json = editor.getJSON();
      const content = json.content?.[0]?.content;

      expect(
        content?.some((node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some((m) => m.type === "suggestionDeletion")
        )
      ).toBe(true);

      expect(
        content?.some((node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some((m) => m.type === "suggestionAddition")
        )
      ).toBe(false);
    });
  });

  describe("acceptSuggestion", () => {
    it("should remove deletion marks and keep addition text", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "test-accept-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      const result = editor.commands.acceptSuggestion("test-accept-1");
      expect(result).toBe(true);

      const text = editor.getText();
      expect(text).toBe("Hello there");

      const json = editor.getJSON();
      const content = json.content?.[0]?.content;
      const hasMarks = content?.some(
        (node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some(
            (m) =>
              m.type === "suggestionAddition" || m.type === "suggestionDeletion"
          )
      );
      expect(hasMarks).toBe(false);
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
    it("should remove addition marks and keep deletion text", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "test-reject-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      const result = editor.commands.rejectSuggestion("test-reject-1");
      expect(result).toBe(true);

      const text = editor.getText();
      expect(text).toBe("Hello world");

      const json = editor.getJSON();
      const content = json.content?.[0]?.content;
      const hasMarks = content?.some(
        (node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some(
            (m) =>
              m.type === "suggestionAddition" || m.type === "suggestionDeletion"
          )
      );
      expect(hasMarks).toBe(false);
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
  });

  describe("rejectAllSuggestions", () => {
    it("should reject all suggestions and restore original text", () => {
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
    it("should return text without addition marks", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "committed-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      const committed = getCommittedTextContent(editor);
      expect(committed).toContain("Hello");
      expect(committed).toContain("world");
      expect(committed).not.toContain("there");
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

    it("should exclude addition marks from HTML", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });
      const targetBlockId = computeBlockId("paragraph", "Hello world");

      editor.commands.applySuggestion({
        id: "html-1",
        targetBlockId,
        content: "<p>Hello there</p>",
      });

      const html = getCommittedHtmlWithBlockIds(editor);
      expect(html).toContain("Hello");
      expect(html).toContain("world");
      expect(html).not.toContain("there");
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
