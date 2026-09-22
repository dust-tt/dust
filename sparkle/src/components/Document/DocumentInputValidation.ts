import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { parseDocumentContent } from "./content";
import { isDocumentSourceWithinLimit } from "./validation";

interface DocumentInputValidationOptions {
  onRejected: (message: string) => void;
}

/**
 * @cc [owner:flvndvd,label:security;product] document-live-validation
 * Invalid or over-budget pastes MUST be rejected without replacing the current draft
 * or suspending its autosave. Ordinary edits MUST NOT reparse the document.
 * Oversized clipboard input MUST be rejected before the HTML parser consumes it.
 */
export const DocumentInputValidation =
  Extension.create<DocumentInputValidationOptions>({
    name: "documentInputValidation",
    addOptions: () => ({ onRejected: () => {} }),

    addProseMirrorPlugins() {
      const { onRejected } = this.options;
      return [
        new Plugin({
          filterTransaction: (transaction) => {
            if (
              !transaction.docChanged ||
              transaction.getMeta("paste") !== true
            ) {
              return true;
            }
            const parsed = parseDocumentContent(
              JSON.stringify(transaction.doc.toJSON()),
              "json"
            );
            if (!parsed.ok) {
              onRejected(parsed.error);
            }
            return parsed.ok;
          },
          props: {
            handleDOMEvents: {
              paste: (view, event) => {
                if (!view.editable || !event.clipboardData) {
                  return false;
                }
                const html = event.clipboardData.getData("text/html");
                const text = event.clipboardData.getData("text/plain");
                if (
                  isDocumentSourceWithinLimit(html) &&
                  isDocumentSourceWithinLimit(text)
                ) {
                  return false;
                }
                event.preventDefault();
                onRejected(
                  "The pasted content exceeds the 512 KiB size limit."
                );
                return true;
              },
            },
          },
        }),
      ];
    },
  });
