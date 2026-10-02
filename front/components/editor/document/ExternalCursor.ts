import { Extension } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * A caret that shows where content written by someone else is being applied, so a reader
 * watching the document sees the change happen rather than finding it done. Driven through
 * transaction metadata by the adoption in useDocumentEditor; nothing in the editor's own
 * editing path touches it.
 */

export const externalCursorKey = new PluginKey<number | null>("externalCursor");

export function setExternalCursor(
  transaction: Transaction,
  position: number | null
): Transaction {
  return transaction.setMeta(externalCursorKey, { position });
}

const CURSOR_CLASS_NAME =
  "relative -ml-px inline-block h-[1.1em] w-0.5 translate-y-[0.15em] rounded-sm bg-highlight-500 align-baseline animate-pulse motion-reduce:animate-none";

export const ExternalCursor = Extension.create({
  name: "externalCursor",

  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key: externalCursorKey,
        state: {
          init: () => null,
          apply: (transaction, position) => {
            const meta = transaction.getMeta(externalCursorKey) as
              | { position: number | null }
              | undefined;
            if (meta !== undefined) {
              return meta.position;
            }
            if (position === null) {
              return null;
            }
            // Keep the caret attached to its text when other transactions move it.
            return transaction.mapping.map(position);
          },
        },
        props: {
          decorations: (state) => {
            const position = externalCursorKey.getState(state);
            if (position === null || position === undefined) {
              return DecorationSet.empty;
            }
            const caret = document.createElement("span");
            caret.className = CURSOR_CLASS_NAME;
            caret.setAttribute("aria-hidden", "true");
            return DecorationSet.create(state.doc, [
              Decoration.widget(position, caret, { side: 1 }),
            ]);
          },
        },
      }),
    ];
  },
});
