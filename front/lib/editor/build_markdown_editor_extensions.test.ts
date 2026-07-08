import { buildMarkdownEditorExtensions } from "@app/lib/editor/build_markdown_editor_extensions";
import type { Editor } from "@tiptap/core";
import { Editor as TiptapEditor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("buildMarkdownEditorExtensions", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new TiptapEditor({
      extensions: buildMarkdownEditorExtensions(),
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  function rawBlocks(e: Editor) {
    return (
      e
        .getJSON()
        .content?.filter((n: { type: string }) => n.type === "rawMarkdownBlock")
        .map((n: { attrs?: { rawContent?: string } }) => n.attrs?.rawContent) ??
      []
    );
  }

  it("preserves markdown tables as raw blocks", () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    editor.commands.setContent(table, { contentType: "markdown" });

    const blocks = rawBlocks(editor);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("| a | b |");
  });

  it("preserves raw content through getMarkdown round-trip", () => {
    const md = "paragraph\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nafter";
    editor.commands.setContent(md, { contentType: "markdown" });

    const out = editor.getMarkdown();
    expect(out).toContain("| a | b |");
    expect(out).toContain("paragraph");
    expect(out).toContain("after");
  });

  it("parses standard markdown links", () => {
    editor.commands.setContent("[test](https://google.com)", {
      contentType: "markdown",
    });

    expect(editor.getMarkdown()).toBe("[test](https://google.com)");
    const linkMark = editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0];
    expect(linkMark?.type).toBe("link");
    expect(linkMark?.attrs?.href).toBe("https://google.com");
  });

  it("renders blockquotes as native blockquote nodes", () => {
    editor.commands.setContent("> quoted text", { contentType: "markdown" });

    expect(rawBlocks(editor)).toHaveLength(0);
    expect(editor.getJSON().content?.[0]?.type).toBe("blockquote");
    expect(editor.getMarkdown()).toContain("> quoted text");
  });

  it("renders horizontal rules as native hr nodes", () => {
    editor.commands.setContent("before\n\n---\n\nafter", {
      contentType: "markdown",
    });

    expect(rawBlocks(editor)).toHaveLength(0);
    expect(
      editor.getJSON().content?.some((node) => node.type === "horizontalRule")
    ).toBe(true);
    expect(editor.getMarkdown()).toContain("---");
  });
});
