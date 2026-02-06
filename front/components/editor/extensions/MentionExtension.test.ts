import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MentionExtension } from "@app/components/editor/extensions/MentionExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";

describe("MentionExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = EditorFactory([MentionExtension]);
  });

  afterEach(() => {
    editor.destroy();
  });

  it("should handle agent mention", () => {
    editor.commands.setContent(":mention[Code Assistant]{sId=agent-123}", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            attrs: {
              description: null,
              id: "agent-123",
              label: "Code Assistant",
              mentionSuggestionChar: "@",
              pictureUrl: null,
              type: "agent",
            },
            type: "mention",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(":mention[Code Assistant]{sId=agent-123}");
  });

  it("should preserve mention through HTML round-trip", () => {
    editor.commands.setContent(":mention[Code Assistant]{sId=agent-123}", {
      contentType: "markdown",
    });

    // Serialize to HTML and reload, simulating an editor re-mount.
    const html = editor.getHTML();
    editor.commands.setContent(html);

    const json = editor.getJSON();
    const mention = json.content?.[0]?.content?.[0];
    expect(mention?.type).toBe("mention");

    const attrs = mention && "attrs" in mention ? mention.attrs : undefined;
    expect(attrs?.id).toBe("agent-123");
    expect(attrs?.label).toBe("Code Assistant");
    expect(attrs?.type).toBe("agent");
  });

  it("should handle user mention", () => {
    editor.commands.setContent(":mention_user[John Doe]{sId=user-456}", {
      contentType: "markdown",
    });

    const json = editor.getJSON();
    expect(json.content).toEqual([
      {
        content: [
          {
            attrs: {
              description: null,
              id: "user-456",
              label: "John Doe",
              mentionSuggestionChar: "@",
              pictureUrl: null,
              type: "user",
            },
            type: "mention",
          },
        ],
        type: "paragraph",
      },
    ]);

    const result = editor.getMarkdown();
    expect(result).toBe(":mention_user[John Doe]{sId=user-456}");
  });
});
