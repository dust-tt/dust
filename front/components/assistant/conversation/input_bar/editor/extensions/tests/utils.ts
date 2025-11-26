import type { Extensions } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";

export const EditorFactory = (extensions: Extensions) => {
  return new Editor({
    extensions: [
      StarterKit.configure({ bold: false, italic: false }),
      ...extensions,
      Markdown,
    ],
  });
};
