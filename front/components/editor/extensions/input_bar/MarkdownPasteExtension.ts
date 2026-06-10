import { Extension } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Parses pasted plain text through the markdown extension's own parser so that
 * markdown like `* item **bold**` becomes a real bullet list with bold text,
 * instead of being mangled by StarterKit's per-mark paste rules (which would
 * pair the bullet `*` with the first `*` of `**bold**`).
 *
 * Hooking `clipboardTextParser` (rather than `handlePaste`) keeps the resulting
 * slice flowing through the other paste handlers (mentions, URL detection,
 * long-text attachments). ProseMirror only calls this for plain-text clipboards
 * — rich HTML pastes still go through `transformPastedHTML`/`cleanupPastedHTML`
 * — and skips it entirely when pasting inside a code block.
 */
export const MarkdownPasteExtension = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          clipboardTextParser: (text) => {
            // `markdown` exists because the Markdown extension is always loaded.
            const doc = editor.schema.nodeFromJSON(
              editor.markdown!.parse(text)
            );
            return Slice.maxOpen(doc.content);
          },
        },
      }),
    ];
  },
});
