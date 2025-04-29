import type { CommandProps } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";

export const ParagraphExtension = Paragraph.extend({
  addKeyboardShortcuts() {
    const enterBehavior = localStorage.getItem("enterBehavior") || "enter";
    const isEnterForSubmission = enterBehavior === "enter";
    const isCmdEnterForSubmission = enterBehavior === "cmd+enter";

    const newLineCommands = ({ commands }: CommandProps) => [
      () => commands.newlineInCode(),
      () => commands.splitListItem("listItem"),
      () => commands.liftEmptyBlock(),
      () => commands.createParagraphNear(),
      () => commands.splitBlock(),
    ];

    const submitCommands = ({ commands }: CommandProps) => [
      () => commands.enter(),
    ];

    return {
      Enter: () => {
        if (isCmdEnterForSubmission) {
          return this.editor.commands.first(newLineCommands); // Prevent default behavior when in cmd+enter mode
        }
        return this.editor.commands.first(submitCommands); // Enter mode
      },

      "Shift-Enter": () => {
        if (isEnterForSubmission) {
          return this.editor.commands.first(newLineCommands);
        }
        return false; // Prevent default behavior when not in enter mode
      },

      "Cmd-Enter": () => {
        if (isCmdEnterForSubmission) {
          return this.editor.commands.first(submitCommands);
        }
        return false; // Prevent default behavior when not in cmd+enter mode
      },
    };
  },
});
