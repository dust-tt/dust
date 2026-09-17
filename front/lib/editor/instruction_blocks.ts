// Locating and replacing instruction blocks, shared by the editor's suggestion extension and the
// server-side apply path so both turn the same edit into the same document.
//
// Tiptap is imported for types only and the DOM is passed in rather than read from a global: the
// server holds a jsdom `document` and a cached parser, and pays no load cost for importing this.
import {
  BLOCK_ID_ATTRIBUTE,
  INSTRUCTIONS_ROOT_NODE_NAME,
} from "@app/lib/editor/node_constants";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type {
  DOMParser as ProseMirrorDOMParser,
  Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import type { Transform } from "@tiptap/pm/transform";

// `UniqueID` stores the block id under `BLOCK_ID_ATTRIBUTE` and renders it `data-`-prefixed.
const BLOCK_ID_DOM_ATTRIBUTE = `data-${BLOCK_ID_ATTRIBUTE}`;

interface ParseInstructionsHtmlOptions {
  // The browser's `document` in the editor, a jsdom one on the server. Narrowed to what this
  // module calls: `Document` declares the whole spec, but jsdom implements only part of it, so a
  // wider type would let a browser-only call through the compiler and fail on the server.
  document: Pick<Document, "createElement">;
  domParser: ProseMirrorDOMParser;
  // Drops every `data-block-id` before parsing, for content whose ids must not be trusted.
  clearBlockIds?: boolean;
}

export function parseInstructionsHtml(
  html: string,
  { clearBlockIds = false, document, domParser }: ParseInstructionsHtmlOptions
): ProseMirrorNode {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  if (clearBlockIds) {
    tempDiv
      .querySelectorAll(`[${BLOCK_ID_DOM_ATTRIBUTE}]`)
      .forEach((element) => element.removeAttribute(BLOCK_ID_DOM_ATTRIBUTE));
  }

  return domParser.parse(tempDiv);
}

/**
 * Parses an edit's HTML into the blocks it should replace its target with.
 *
 * The schema enforces doc > instructionsRoot > blocks, so parsing "<p>text</p>" returns
 * doc > instructionsRoot > paragraph. For root targets, return the instructionsRoot directly so
 * all child blocks are preserved. For single-block targets, return all children of the
 * instructionsRoot — this supports multi-block replacements where one block is replaced by
 * several (e.g., "<p>A</p><p>B</p>").
 */
export function parseHTMLToBlocks(
  html: string,
  targetBlockId: string,
  options: ParseInstructionsHtmlOptions
): ProseMirrorNode[] {
  const parsed = parseInstructionsHtml(html, options);

  const first = parsed.firstChild;
  if (
    first?.type.name === INSTRUCTIONS_ROOT_NODE_NAME &&
    targetBlockId === INSTRUCTIONS_ROOT_TARGET_BLOCK_ID
  ) {
    return [first];
  }

  const container =
    first?.type.name === INSTRUCTIONS_ROOT_NODE_NAME ? first : parsed;
  const children: ProseMirrorNode[] = [];
  container.content.forEach((child) => children.push(child));

  return children;
}

export function findBlockByBlockId(
  doc: ProseMirrorNode,
  targetBlockId: string
): { node: ProseMirrorNode; pos: number } | null {
  let result: { node: ProseMirrorNode; pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (result) {
      return false;
    }

    if (node.attrs[BLOCK_ID_ATTRIBUTE] === targetBlockId) {
      result = { node, pos };

      return false;
    }

    return true;
  });

  return result;
}

export function replaceBlock(
  tr: Transform,
  { node: blockNode, pos: blockPos }: { node: ProseMirrorNode; pos: number },
  newNodes: ProseMirrorNode[]
): void {
  if (newNodes.length === 1) {
    const newNode = newNodes[0];
    if (blockNode.type === newNode.type) {
      // Same type: replace inner content.
      const from = blockPos + 1;
      const to = blockPos + blockNode.nodeSize - 1;
      tr.replaceWith(from, to, newNode.content);
    } else {
      // Cross-type: replace the entire block node.
      tr.replaceWith(blockPos, blockPos + blockNode.nodeSize, newNode);
    }
  } else {
    // Multi-block: replace the old block with all new blocks.
    tr.replaceWith(blockPos, blockPos + blockNode.nodeSize, newNodes);
  }
}
