import { isSubmitMessageKey } from "@app/lib/keymaps";
import { HardBreak } from "@tiptap/extension-hard-break";

export const HardBreakExtension = HardBreak.extend({
  addKeyboardShortcuts() {
    const submitMessageKey = localStorage.getItem("submitMessageKey");
    const isCmdEnter =
      isSubmitMessageKey(submitMessageKey) && submitMessageKey === "cmd+enter";

    return {
      ...this.parent?.(),

      "Mod-Enter": () => {
        if (isCmdEnter) {
          return false;
        }

        return this.editor.commands.first(({ commands }) => [
          () => commands.setHardBreak(),
        ]);
      },
    };
  },
});
