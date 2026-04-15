import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { JSDOM } from "jsdom";

/**
 * Returns every `data-block-id` nested under `targetBlockId` in serialized
 * instructions HTML
 */
export function getDescendantBlockIds(
  instructionsHtml: string,
  targetBlockId: string
): Set<string> {
  const descendants = new Set<string>();

  const dom = new JSDOM(instructionsHtml);
  const doc = dom.window.document;

  const targetElement = doc.querySelector(`[data-block-id="${targetBlockId}"]`);
  if (!targetElement) {
    return descendants;
  }

  const descendantElements = targetElement.querySelectorAll("[data-block-id]");
  descendantElements.forEach((element) => {
    const descendantId = element.getAttribute("data-block-id");
    if (descendantId && descendantId !== targetBlockId) {
      descendants.add(descendantId);
    }
  });

  return descendants;
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
  instructionsHtml: string | null
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
      const descendants = getDescendantBlockIds(instructionsHtml, id);
      for (const bId of blockIdsB) {
        if (descendants.has(bId)) {
          return true;
        }
      }
    }
    for (const id of blockIdsB) {
      const descendants = getDescendantBlockIds(instructionsHtml, id);
      for (const aId of blockIdsA) {
        if (descendants.has(aId)) {
          return true;
        }
      }
    }
  }

  return false;
}
