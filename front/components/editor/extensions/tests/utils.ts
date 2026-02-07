import type { Extensions } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { Editor } from "@tiptap/react";
import type { StarterKitOptions } from "@tiptap/starter-kit";
import { StarterKit } from "@tiptap/starter-kit";

interface EditorFactoryOptions {
  starterKit?: Partial<StarterKitOptions>;
}

export const EditorFactory = (
  extensions: Extensions,
  options?: EditorFactoryOptions
) => {
  return new Editor({
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        hardBreak: false,
        ...options?.starterKit,
      }),
      Markdown,
      ...extensions,
    ],
  });
};
