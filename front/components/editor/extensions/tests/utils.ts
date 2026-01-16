import type { Extensions } from "@tiptap/core";
import { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";

import { EmptyLineParagraphExtension } from "@app/components/editor/extensions/EmptyLineParagraphExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import { getMarkdownExtension } from "@app/components/editor/extensions/markdown";
import { OrderedListExtension } from "@app/components/editor/extensions/OrderedListExtension";

export const EditorFactory = (extensions: Extensions) => {
  return new Editor({
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        paragraph: false,
        hardBreak: false,
        orderedList: false, // Allow custom OrderedList extension
        listItem: false, // Allow custom ListItem extension
      }),
      EmptyLineParagraphExtension,
      ListItemExtension,
      OrderedListExtension,
      getMarkdownExtension(false), // Use default markdown for tests (tests can override by passing CustomMarkdown explicitly)
      ...extensions,
    ],
  });
};
