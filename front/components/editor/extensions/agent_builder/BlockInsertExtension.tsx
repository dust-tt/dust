import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";

export interface BlockInsertOptions {
  suggestion: Omit<Parameters<typeof Suggestion>[0], "editor">;
}

export const BlockInsertExtension = Extension.create<BlockInsertOptions>({
  name: "blockInsert",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        pluginKey: new PluginKey("blockInsert"),
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
