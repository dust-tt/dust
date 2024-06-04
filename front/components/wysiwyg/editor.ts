import Document from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { History } from "@tiptap/extension-history";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

export const CONTENT_EDITOR_EXTENSIONS = [
  Document,
  Text,
  Paragraph,
  History,
  HardBreak.extend({
    addKeyboardShortcuts() {
      return {
        "Shift-Enter": () => this.editor.commands.setHardBreak(),
      };
    },
  }),
];
