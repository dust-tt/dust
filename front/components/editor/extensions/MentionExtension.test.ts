import { MentionExtension } from "@app/components/editor/extensions/MentionExtension";
import { EditorFactory } from "@app/components/editor/extensions/tests/utils";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

  describe("with stripAgentMentions", () => {
    let strippingEditor: Editor;

    beforeEach(() => {
      strippingEditor = EditorFactory([
        MentionExtension.configure({ stripAgentMentions: true }),
      ]);
    });

    afterEach(() => {
      strippingEditor.destroy();
    });

    it("should convert agent mentions to plain text", () => {
      strippingEditor.commands.setContent(
        "hello :mention[Code Assistant]{sId=agent-123} world",
        {
          contentType: "markdown",
        }
      );

      const json = strippingEditor.getJSON();
      expect(json.content).toEqual([
        {
          content: [
            {
              text: "hello @Code Assistant world",
              type: "text",
            },
          ],
          type: "paragraph",
        },
      ]);
    });

    it("should keep user mentions", () => {
      strippingEditor.commands.setContent(
        ":mention_user[John Doe]{sId=user-456} and :mention[Code Assistant]{sId=agent-123}",
        {
          contentType: "markdown",
        }
      );

      const json = strippingEditor.getJSON();
      const nodes = json.content?.[0]?.content ?? [];
      const mentionNodes = nodes.filter((n) => n.type === "mention");
      expect(mentionNodes).toHaveLength(1);
      const attrs =
        "attrs" in mentionNodes[0] ? mentionNodes[0].attrs : undefined;
      expect(attrs?.type).toBe("user");
      expect(strippingEditor.getText()).toContain("@Code Assistant");
    });
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
