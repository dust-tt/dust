import Document from "@tiptap/extension-document";

import { INSTRUCTIONS_ROOT_NODE_NAME } from "./InstructionsRootExtension";

// Overrides the default Document node so the editor enforces a single
// instructionsRoot wrapper as its only child: doc > instructionsRoot > block+.
export const InstructionsDocumentExtension = Document.extend({
  content: INSTRUCTIONS_ROOT_NODE_NAME,
});
