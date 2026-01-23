import Blockquote from "@tiptap/extension-blockquote";

/**
 * Custom Blockquote extension that overrides the default keyboard shortcut
 * to use Mod+Shift+9 instead of Mod+Shift+B
 */
export const BlockquoteExtension = Blockquote.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-9": () => this.editor.commands.toggleBlockquote(),
    };
  },
});
