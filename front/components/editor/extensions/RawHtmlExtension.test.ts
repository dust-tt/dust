import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("RawHtmlExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    // extension already added to the editor factor
    editor = EditorFactory([]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should preserve anchor tags as HTML not markdown links", () => {
    editor.commands.setContent('<a href="https://example.com">Link</a>', {
      contentType: "markdown",
    });
    const result = editor.getMarkdown();
    // Should preserve as HTML, not convert to [Link](https://example.com)
    expect(result).toBe('<a href="https://example.com">Link</a>');
  });

  it("should preserve span with style", () => {
    editor.commands.setContent('<span style="color: red">text</span>', {
      contentType: "markdown",
    });
    const result = editor.getMarkdown();
    expect(result).toBe('<span style="color: red">text</span>');
  });

  it("should preserve div tags", () => {
    editor.commands.setContent('<div class="container">content</div>', {
      contentType: "markdown",
    });
    const result = editor.getMarkdown();
    expect(result).toBe('<div class="container">content</div>');
  });

  it("should handle complex attributes", () => {
    editor.commands.setContent(
      '<button onclick="doSomething()" class="btn" data-id="123">Click</button>',
      { contentType: "markdown" }
    );
    const result = editor.getMarkdown();
    expect(result).toBe(
      '<button onclick="doSomething()" class="btn" data-id="123">Click</button>'
    );
  });
});
