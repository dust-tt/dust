import { Paragraph } from "@tiptap/extension-paragraph";

export const ParagraphExtension = Paragraph.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),

      "Shift-Enter": () => {
        // Chain is what Tiptap does by default for Enter:
        // - newlineInCode: insert line breaks in code blocks
        // - splitListItem: if in a list item, create new list item
        // - liftEmptyBlock: if empty block (like empty quote), exit it
        // - splitBlock: fallback -> normal line break
        return this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          // Only try to split list items if the editor schema includes them
          () =>
            this.editor.schema.nodes.listItem
              ? commands.splitListItem("listItem")
              : false,
          () => commands.liftEmptyBlock(),
          () => commands.createParagraphNear(),
          () => commands.splitBlock(),
        ]);
      },
    };
  },
});
