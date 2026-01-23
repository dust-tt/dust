import { renderHook } from "@testing-library/react";
import { Markdown } from "@tiptap/markdown";
import { useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { EmojiExtension } from "@app/components/editor/extensions/EmojiExtension";

describe("EmojiExtension", () => {
  it("renders emoji nodes correctly", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [StarterKit, Markdown, EmojiExtension],
        content: "",
        immediatelyRender: false,
      })
    );

    const editor = result.current;
    expect(editor).toBeDefined();

    // Insert an emoji node
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "emoji",
        attrs: { name: "grinning_face_with_big_eyes" },
      })
      .run();

    // Verify it's in the document
    const json = editor?.getJSON();
    expect(json).toEqual({
      content: [
        {
          content: [
            {
              attrs: {
                name: "grinning_face_with_big_eyes",
              },
              type: "emoji",
            },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
  });

  it("handles multiple emojis in content", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [StarterKit, Markdown, EmojiExtension],
        content: "",
        immediatelyRender: false,
      })
    );

    const editor = result.current;
    expect(editor).toBeDefined();

    // Insert multiple emojis
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "emoji",
        attrs: { name: "red_heart" },
      })
      .insertContent(" ")
      .insertContent({
        type: "emoji",
        attrs: { name: "fire" },
      })
      .insertContent(" ")
      .insertContent({
        type: "emoji",
        attrs: { name: "rocket" },
      })
      .run();

    // Verify all emojis are in the document
    const json = editor?.getJSON();
    const content = json?.content?.[0]?.content;
    expect(content).toBeDefined();

    // Count emoji nodes
    const emojiNodes = content?.filter((node: any) => node.type === "emoji");
    expect(emojiNodes?.length).toBe(3);
  });

  it("serializes emoji content to markdown format", () => {
    const { result } = renderHook(() =>
      useEditor({
        extensions: [StarterKit, Markdown, EmojiExtension],
        content: "",
        immediatelyRender: false,
      })
    );

    const editor = result.current;
    expect(editor).toBeDefined();

    // Insert an emoji
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: "emoji",
        attrs: { name: "heart_eyes" },
      })
      .run();

    // Get markdown - emoji extension serializes to :shortcode: format
    const markdown = editor?.getMarkdown();
    expect(markdown).toBeDefined();
    expect(markdown).toContain("😍");
  });
});
