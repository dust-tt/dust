import Paragraph from "@tiptap/extension-paragraph";

export const ParagraphExtension = Paragraph.extend({
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => this.editor.commands.splitBlock(),
    };
  },
});
