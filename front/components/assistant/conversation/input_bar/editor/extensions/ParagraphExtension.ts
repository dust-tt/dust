import Paragraph from "@tiptap/extension-paragraph";

export const ParagraphExtension = Paragraph.extend({
  addKeyboardShortcuts() {
    const submitMessageKey =
      localStorage.getItem("submitMessageKey") || "enter";
    const isCmdEnter = submitMessageKey === "cmd+enter";

    return {
      Enter: () => false,

      "Shift-Enter": () => {
        if (isCmdEnter) {
          return false;
        }

        // Chain is what Tiptap does by default for Enter:
        // - newlineInCode: insert line breaks in code blocks
        // - splitListItem: if in a list item, create new list item
        // - liftEmptyBlock: if empty block (like empty quote), exit it
        // - splitBlock: fallback -> normal line break
        return this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.splitListItem("listItem"),
          () => commands.liftEmptyBlock(),
          () => commands.createParagraphNear(),
          () => commands.splitBlock(),
        ]);
      },
    };
  },
});
