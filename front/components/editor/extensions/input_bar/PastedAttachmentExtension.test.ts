import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PastedAttachmentExtension } from "@app/components/editor/extensions/input_bar/PastedAttachmentExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("PastedAttachmentExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([PastedAttachmentExtension]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should handle pasted content", () => {
    editor.commands.setContent(
      ":pasted_content[Document.pdf]{pastedId=file-123}",
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            attrs: {
              fileId: "file-123",
              textContent: null,
              title: "Document.pdf",
            },
            type: "pastedAttachment",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(":pasted_content[Document.pdf]{pastedId=file-123}");
  });

  it("should handle pasted content with space and other characters", () => {
    editor.commands.setContent(
      ":pasted_content[My File (2024).pdf]{pastedId=file-456}",
      {
        contentType: "markdown",
      }
    );

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            attrs: {
              fileId: "file-456",
              textContent: null,
              title: "My File (2024).pdf",
            },
            type: "pastedAttachment",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(
      ":pasted_content[My File (2024).pdf]{pastedId=file-456}"
    );
  });
});
