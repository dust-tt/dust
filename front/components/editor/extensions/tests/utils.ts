import type { Extensions } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";

import { EmptyLineParagraphExtension } from "@app/components/editor/extensions/EmptyLineParagraphExtension";
import { RawHtmlExtension } from "@app/components/editor/extensions/RawHtmlExtension";

export const EditorFactory = (extensions: Extensions) => {
  return new Editor({
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        paragraph: false,
        hardBreak: false,
      }),
      EmptyLineParagraphExtension,
      Markdown,
      RawHtmlExtension,
      ...extensions,
    ],
  });
};
