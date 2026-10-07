import {
  commentInputExtensions,
  commentMarkdown,
} from "@app/components/editor/document/commentInputExtensions";
import { MentionExtension } from "@app/components/editor/extensions/MentionExtension";
import { readMessageSuggestions } from "@app/lib/markdown/dfm";
import { Ok } from "@app/types/shared/result";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("commentInputExtensions", () => {
  let editor: Editor | null = null;

  const createEditor = (onSubmit = vi.fn()) => {
    editor = new Editor({
      extensions: commentInputExtensions({
        placeholder: "Comment",
        hostExtensions: [MentionExtension],
        onSubmit: { current: onSubmit },
      }),
    });
    return editor;
  };

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("writes mentions as directives and line breaks without trailing spaces", () => {
    const field = createEditor();

    field.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "mention",
              attrs: { type: "agent", id: "agt_1", label: "Helper" },
            },
            { type: "text", text: " look" },
            { type: "hardBreak" },
            {
              type: "mention",
              attrs: { type: "user", id: "usr_1", label: "Daph" },
            },
          ],
        },
      ],
    });

    expect(field.getMarkdown().trim()).toBe(
      ":mention[Helper]{sId=agt_1} look\\\n:mention_user[Daph]{sId=usr_1}"
    );
  });

  it("writes no line break at the end of a block, outside code blocks", () => {
    const field = createEditor();

    field.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "a" }, { type: "hardBreak" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "b" },
            { type: "hardBreak" },
            { type: "text", text: "c" },
            { type: "hardBreak" },
            { type: "text", text: " " },
          ],
        },
        { type: "codeBlock", content: [{ type: "text", text: "d\n" }] },
      ],
    });

    expect(commentMarkdown(field)).toBe("a\n\nb\\\nc\n\n```\nd\n\n```");
  });

  it("writes a suggestion block that reads back whatever backticks it holds", () => {
    const field = createEditor();
    const suggestion = "use ```fences``` here";

    field.commands.setContent({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Better:" }] },
        {
          type: "codeBlock",
          attrs: { language: "suggestion" },
          content: [{ type: "text", text: suggestion }],
        },
      ],
    });

    expect(readMessageSuggestions(field.getMarkdown().trim())).toEqual(
      new Ok([
        { kind: "text", text: "Better:\n\n" },
        { kind: "suggestion", suggestion },
      ])
    );
  });

  it("writes an out-of-bounds suggestion as one fenced block the codec refuses", () => {
    const field = createEditor();
    const suggestion = "`a".repeat(130_000);

    field.commands.setContent({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "suggestion" },
          content: [{ type: "text", text: suggestion }],
        },
      ],
    });

    const markdown = field.getMarkdown().trim();
    expect(markdown.startsWith("```suggestion\n")).toBe(true);
    expect(readMessageSuggestions(markdown).isErr()).toBe(true);
  });

  it("reads a suggestion block from Markdown as a suggestion code block", () => {
    const field = createEditor();

    field.commands.setContent("````suggestion\nkeep ``` this\n````", {
      contentType: "markdown",
    });

    const [block] = field.getJSON().content ?? [];
    expect(block?.type).toBe("codeBlock");
    expect(block?.attrs?.language).toBe("suggestion");
    expect(
      field.view.dom.querySelector("[data-comment-suggestion]")?.textContent
    ).toContain("Suggested change");
  });
});
