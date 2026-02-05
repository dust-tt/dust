import UniqueID from "@tiptap/extension-unique-id";

/**
 * Simple hash function for generating stable block IDs.
 * Uses djb2 algorithm for fast, reasonably distributed hashes.
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and then to hex.
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Extracts text content from a ProseMirror node.
 */
function getNodeTextContent(node: { textContent?: string }): string {
  return node.textContent ?? "";
}

/**
 * Block ID extension that adds stable, content-based IDs to block-level nodes.
 * Uses TipTap's official UniqueID extension with custom ID generation based on content hash.
 *
 * IDs are computed from the node type and content hash, making them deterministic:
 * - Same content always produces the same ID
 * - IDs are stable across page loads
 * - Format: "{nodeType}-{contentHash}" (e.g., "paragraph-a1b2c3d4")
 *
 * Renders as `data-block-id` attribute in HTML output.
 */
export const BlockIdExtension = UniqueID.configure({
  types: ["paragraph", "heading"],
  attributeName: "blockId",
  generateID: ({ node }) => {
    const textContent = getNodeTextContent(node);
    const hash = hashString(textContent);
    return `${node.type.name}-${hash}`;
  },
});

/**
 * Computes a stable block ID from the block type and text content.
 * Exported for use in tests.
 */
export function computeBlockId(blockType: string, textContent: string): string {
  const hash = hashString(textContent);
  return `${blockType}-${hash}`;
}
