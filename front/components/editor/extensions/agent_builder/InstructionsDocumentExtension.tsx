import { INSTRUCTIONS_ROOT_NODE_NAME } from "@app/lib/editor/specs/instructionsRootSpec";
import Document from "@tiptap/extension-document";

// Overrides the default Document node so the editor enforces a single
// instructionsRoot wrapper as its only child: doc > instructionsRoot > block+.
export const InstructionsDocumentExtension = Document.extend({
  content: INSTRUCTIONS_ROOT_NODE_NAME,
});
