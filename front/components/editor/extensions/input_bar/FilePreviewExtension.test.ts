import { FilePreviewExtension } from "@app/components/editor/extensions/input_bar/FilePreviewExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import { getFilePreviewMarkdownDirective } from "@app/lib/markdown/file_preview";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("FilePreviewExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([FilePreviewExtension]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("parses scoped file preview directives from markdown", () => {
    const directive = getFilePreviewMarkdownDirective({
      contentType: "application/pdf",
      path: "conversation-c1/booklet.pdf",
      title: "booklet.pdf",
    });

    editor.commands.setContent(directive, {
      contentType: "markdown",
    });

    expect(editor.getJSON()).toEqual({
      content: [
        {
          content: [
            {
              attrs: {
                contentType: "application/pdf",
                path: "conversation-c1/booklet.pdf",
                title: "booklet.pdf",
              },
              type: "filePreview",
            },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
  });

  it("round-trips file preview directives to markdown", () => {
    const directive = getFilePreviewMarkdownDirective({
      contentType: "application/pdf",
      path: "conversation-c1/booklet.pdf",
      title: "booklet.pdf",
    });

    editor.commands.setContent(directive, {
      contentType: "markdown",
    });

    expect(editor.getMarkdown()).toBe(directive);
  });
});
