import { generateShortBlockId } from "@app/lib/generate_short_block_id";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_UNIQUE_ID_NODE_TYPES,
} from "@app/lib/editor/node_constants";
import UniqueID from "@tiptap/extension-unique-id";

export {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_UNIQUE_ID_NODE_TYPES,
} from "@app/lib/editor/node_constants";

/**
 * Block ID extension that adds unique IDs to block-level nodes
 * (paragraphs, headings, and instruction blocks).
 *
 * These IDs enable the sidekick to target specific blocks for suggestions.
 * IDs are persisted in `instructionsHtml` and remain stable as long as the HTML is preserved.
 *
 * Renders as `data-block-id` attribute in HTML output.
 */
export const BlockIdExtension = UniqueID.configure({
  types: [...BLOCK_ID_UNIQUE_ID_NODE_TYPES],
  attributeName: BLOCK_ID_ATTRIBUTE,
  generateID: generateShortBlockId,
});
