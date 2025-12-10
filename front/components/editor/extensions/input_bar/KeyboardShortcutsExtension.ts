import { Extension } from "@tiptap/core";

/**
 *  This extension overrides the keyboard shortcuts to get the same behavior of "Enter" and "Shift-Enter" in the editor.
 *  "Enter" is used to submit the message.
 */
export const KeyboardShortcutsExtension = Extension.create({
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": ({ editor }) => {
        // Chain is what Tiptap does by default for Enter:
        // - newlineInCode: insert line breaks in code blocks
        // - splitListItem: if in a list item, create new list item, only if we are already in a list item
        // - createParagraphNear: create a new paragraph
        // - liftEmptyBlock: if empty block (like empty quote), exit it
        // - splitBlock: fallback -> normal line break
        return editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () =>
            editor.schema.nodes.listItem
              ? commands.splitListItem("listItem")
              : false,
          () => commands.createParagraphNear(),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock(),
        ]);
      },
    };
  },
});
