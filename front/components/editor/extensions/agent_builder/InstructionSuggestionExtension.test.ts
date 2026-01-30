import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getCommittedTextContent,
  InstructionSuggestionExtension,
} from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("InstructionSuggestionExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([InstructionSuggestionExtension]);
  });

  afterEach(() => {
    editor.destroy();
  });

  describe("applySuggestion", () => {
    it("should apply suggestion with deletion and addition marks", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-1",
        find: "world",
        replacement: "there",
      });

      expect(result).toBe(true);

      const json = editor.getJSON();
      const paragraph = json.content?.[0];
      expect(paragraph?.type).toBe("paragraph");

      // Should have: "Hello " + "world" (deletion) + "there" (addition)
      const content = paragraph?.content;
      expect(content).toHaveLength(3);

      // Plain text "Hello "
      expect(content?.[0]).toEqual({ type: "text", text: "Hello " });

      // Deletion mark on "world"
      expect(content?.[1]).toEqual({
        type: "text",
        text: "world",
        marks: [
          {
            type: "suggestionDeletion",
            attrs: { suggestionId: "test-suggestion-1" },
          },
        ],
      });

      // Addition mark on "there"
      expect(content?.[2]).toEqual({
        type: "text",
        text: "there",
        marks: [
          {
            type: "suggestionAddition",
            attrs: { suggestionId: "test-suggestion-1" },
          },
        ],
      });
    });

    it("should handle suggestion that replaces entire content", () => {
      editor.commands.setContent("old content", { contentType: "markdown" });

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-2",
        find: "old content",
        replacement: "new content",
      });

      expect(result).toBe(true);

      const json = editor.getJSON();
      const content = json.content?.[0]?.content;

      // Should have deletion + addition only (no plain text)
      expect(content).toHaveLength(2);

      expect(content?.[0]).toMatchObject({
        text: "old content",
        marks: [{ type: "suggestionDeletion" }],
      });

      expect(content?.[1]).toMatchObject({
        text: "new content",
        marks: [{ type: "suggestionAddition" }],
      });
    });

    it("should handle insertion (empty find)", () => {
      editor.commands.setContent("Hello", { contentType: "markdown" });

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-3",
        find: "",
        replacement: " world",
      });

      expect(result).toBe(true);

      const json = editor.getJSON();
      const content = json.content?.[0]?.content;

      // Should have addition mark for new text
      const additionNode = content?.find(
        (node: { marks?: Array<{ type: string }> }) =>
          node.marks?.some((m) => m.type === "suggestionAddition")
      );
      expect(additionNode).toMatchObject({ text: " world" });
    });

    it("should handle deletion (empty replacement)", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-4",
        find: " world",
        replacement: "",
      });

      expect(result).toBe(true);

      const json = editor.getJSON();
      const content = json.content?.[0]?.content;

      // Should have "Hello" plain + " world" with deletion mark (no addition)
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

    it("should return false if find text not found", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const result = editor.commands.applySuggestion({
        id: "test-suggestion-5",
        find: "not found",
        replacement: "replacement",
      });

      expect(result).toBe(false);
    });

    it("should track suggestion ID in storage", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      editor.commands.applySuggestion({
        id: "test-suggestion-6",
        find: "world",
        replacement: "there",
      });

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-suggestion-6");
    });

    it("should handle multiple suggestions", () => {
      editor.commands.setContent("Hello world, goodbye world", {
        contentType: "markdown",
      });

      editor.commands.applySuggestion({
        id: "suggestion-a",
        find: "Hello",
        replacement: "Hi",
      });

      editor.commands.applySuggestion({
        id: "suggestion-b",
        find: "goodbye",
        replacement: "farewell",
      });

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("suggestion-a");
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("suggestion-b");
    });
  });

  describe("acceptSuggestion", () => {
    it("should remove deletion marks and keep addition text", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      editor.commands.applySuggestion({
        id: "test-accept-1",
        find: "world",
        replacement: "there",
      });

      const result = editor.commands.acceptSuggestion("test-accept-1");
      expect(result).toBe(true);

      // After accepting: "Hello there" (deletion removed, addition kept without mark)
      const text = editor.getText();
      expect(text).toBe("Hello there");

      // No suggestion marks should remain
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

      editor.commands.applySuggestion({
        id: "test-accept-2",
        find: "world",
        replacement: "there",
      });

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("test-accept-2");

      editor.commands.acceptSuggestion("test-accept-2");

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).not.toContain("test-accept-2");
    });

    it("should only affect the specified suggestion", () => {
      editor.commands.setContent("Hello world, goodbye world", {
        contentType: "markdown",
      });

      editor.commands.applySuggestion({
        id: "suggestion-x",
        find: "Hello",
        replacement: "Hi",
      });

      editor.commands.applySuggestion({
        id: "suggestion-y",
        find: "goodbye",
        replacement: "farewell",
      });

      // Accept only suggestion-x
      editor.commands.acceptSuggestion("suggestion-x");

      // suggestion-x should be removed from storage
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).not.toContain("suggestion-x");

      // suggestion-y should still be active
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toContain("suggestion-y");
    });
  });

  describe("rejectSuggestion", () => {
    it("should remove addition marks and keep deletion text", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      editor.commands.applySuggestion({
        id: "test-reject-1",
        find: "world",
        replacement: "there",
      });

      const result = editor.commands.rejectSuggestion("test-reject-1");
      expect(result).toBe(true);

      // After rejecting: "Hello world" (original text restored, addition removed)
      const text = editor.getText();
      expect(text).toBe("Hello world");

      // No suggestion marks should remain
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

      editor.commands.applySuggestion({
        id: "test-reject-2",
        find: "world",
        replacement: "there",
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
    it("should accept a single suggestion", () => {
      editor.commands.setContent("Hello world", {
        contentType: "markdown",
      });

      editor.commands.applySuggestion({
        id: "all-1",
        find: "Hello",
        replacement: "Hi",
      });

      editor.commands.acceptAllSuggestions();

      const text = editor.getText();
      expect(text).toContain("Hi");
      expect(text).not.toContain("Hello");

      // Storage should be empty
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toHaveLength(0);
    });

    it("should clear all suggestion IDs from storage", () => {
      editor.commands.setContent("Hello world", {
        contentType: "markdown",
      });

      editor.commands.applySuggestion({
        id: "all-2",
        find: "world",
        replacement: "there",
      });

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toHaveLength(1);

      editor.commands.acceptAllSuggestions();

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toHaveLength(0);
    });
  });

  describe("rejectAllSuggestions", () => {
    it("should reject a single suggestion and restore original text", () => {
      editor.commands.setContent("Hello world", {
        contentType: "markdown",
      });

      editor.commands.applySuggestion({
        id: "reject-all-1",
        find: "Hello",
        replacement: "Hi",
      });

      editor.commands.rejectAllSuggestions();

      // Original text should be restored
      const text = editor.getText();
      expect(text).toContain("Hello");
      expect(text).not.toContain("Hi");

      // Storage should be empty
      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toHaveLength(0);
    });

    it("should clear all suggestion IDs from storage", () => {
      editor.commands.setContent("Hello world", {
        contentType: "markdown",
      });

      editor.commands.applySuggestion({
        id: "reject-all-2",
        find: "world",
        replacement: "there",
      });

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toHaveLength(1);

      editor.commands.rejectAllSuggestions();

      expect(
        editor.storage.instructionSuggestion.activeSuggestionIds
      ).toHaveLength(0);
    });
  });

  describe("getCommittedTextContent", () => {
    it("should return text without addition marks", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      editor.commands.applySuggestion({
        id: "committed-1",
        find: "world",
        replacement: "there",
      });

      // getCommittedTextContent should return original text (without additions)
      const committed = getCommittedTextContent(editor);
      expect(committed).toContain("Hello");
      expect(committed).toContain("world");
      expect(committed).not.toContain("there");
    });

    it("should return empty string for editor with only additions", () => {
      editor.commands.setContent("", { contentType: "markdown" });

      editor.commands.applySuggestion({
        id: "committed-2",
        find: "",
        replacement: "new content",
      });

      const committed = getCommittedTextContent(editor);
      // Should not contain the addition
      expect(committed).not.toContain("new content");
    });

    it("should return full text when no suggestions applied", () => {
      editor.commands.setContent("Hello world", { contentType: "markdown" });

      const committed = getCommittedTextContent(editor);
      expect(committed).toContain("Hello world");
    });
  });
});
