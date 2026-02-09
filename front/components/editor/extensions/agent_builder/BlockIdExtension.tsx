import UniqueID from "@tiptap/extension-unique-id";

/**
 * Generates a short random ID (8-character hex string).
 * Uses crypto API for secure randomness.
 */
function generateShortId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const BLOCK_ID_ATTRIBUTE = "block-id";

/**
 * Block ID extension that adds unique IDs to block-level nodes
 * (paragraphs, headings, and instruction blocks).
 *
 * These IDs enable the copilot to target specific blocks for suggestions.
 * IDs are persisted in `instructionsHtml` and remain stable as long as the HTML is preserved.
 *
 * Renders as `data-block-id` attribute in HTML output.
 */
export const BlockIdExtension = UniqueID.configure({
  types: [
    "heading",
    "instructionBlock",
    "orderedList",
    "paragraph",
    "bulletList",
  ],
  attributeName: BLOCK_ID_ATTRIBUTE,
  generateID: generateShortId,
});
