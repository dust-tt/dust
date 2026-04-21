import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { JSDOM } from "jsdom";

function getDescendantBlockIdsFromDoc(
  doc: Document,
  targetBlockId: string
): Set<string> {
  const descendants = new Set<string>();
  const targetElement = doc.querySelector(`[data-block-id="${targetBlockId}"]`);
  if (!targetElement) {
    return descendants;
  }
  targetElement.querySelectorAll("[data-block-id]").forEach((element) => {
    const descendantId = element.getAttribute("data-block-id");
    if (descendantId && descendantId !== targetBlockId) {
      descendants.add(descendantId);
    }
  });
  return descendants;
}

/**
 * Returns every `data-block-id` nested under `targetBlockId` in serialized
 * instructions HTML
 */
export function getDescendantBlockIds(
  instructionsHtml: string,
  targetBlockId: string
): Set<string> {
  const dom = new JSDOM(instructionsHtml);
  return getDescendantBlockIdsFromDoc(dom.window.document, targetBlockId);
}

/**
 * Returns every `data-block-id` present anywhere in serialized instructions HTML.
 */
export function getAllBlockIds(instructionsHtml: string): Set<string> {
  const doc = new JSDOM(instructionsHtml).window.document;
  const blockIds = new Set<string>();
  doc.querySelectorAll("[data-block-id]").forEach((element) => {
    const id = element.getAttribute("data-block-id");
    if (id) {
      blockIds.add(id);
    }
  });
  return blockIds;
}

/**
 * Parses instructions HTML once and returns a map of blockId -> descendant block IDs
 * for the given block IDs. Use this to avoid repeated HTML parsing when checking
 * conflicts for multiple block IDs.
 */
export function buildDescendantMap(
  instructionsHtml: string,
  blockIds: Iterable<string>
): Map<string, Set<string>> {
  const dom = new JSDOM(instructionsHtml);
  const doc = dom.window.document;
  const map = new Map<string, Set<string>>();
  for (const blockId of blockIds) {
    map.set(blockId, getDescendantBlockIdsFromDoc(doc, blockId));
  }
  return map;
}

/**
 * Returns true if two sets of block IDs target overlapping parts of the HTML tree.
 *
 * Conflict cases (symmetric):
 * - Either set contains the root block ID (mutually exclusive with any other edit)
 * - Both sets contain the same block ID
 * - Any block in setA is an ancestor of any block in setB, or vice versa
 */
export function instructionBlockSetsConflict(
  blockIdsA: Set<string>,
  blockIdsB: Set<string>,
  instructionsHtml: string | null,
  descendantMap: Map<string, Set<string>>
): boolean {
  if (blockIdsA.size === 0 || blockIdsB.size === 0) {
    return false;
  }

  // Root rewrite conflicts with everything.
  if (
    blockIdsA.has(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID) ||
    blockIdsB.has(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID)
  ) {
    return true;
  }

  // Same block targeted in both sets.
  for (const id of blockIdsA) {
    if (blockIdsB.has(id)) {
      return true;
    }
  }

  // Ancestor-descendant relationship (symmetric: check both directions).
  if (instructionsHtml) {
    for (const id of blockIdsA) {
      const descendants = descendantMap.get(id) ?? new Set<string>();
      for (const bId of blockIdsB) {
        if (descendants.has(bId)) {
          return true;
        }
      }
    }
    for (const id of blockIdsB) {
      const descendants = descendantMap.get(id) ?? new Set<string>();
      for (const aId of blockIdsA) {
        if (descendants.has(aId)) {
          return true;
        }
      }
    }
  }

  return false;
}
