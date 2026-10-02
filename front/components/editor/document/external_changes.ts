import type { JSONContent } from "@tiptap/core";
import type { Node, Schema } from "@tiptap/pm/model";
import { diffArrays } from "diff";

/**
 * How a document written by someone else is applied to an open editor: block by block where
 * blocks changed, and inside a changed block a few characters at a time, so the reader sees
 * the change arrive where it lands instead of the document being swapped under them.
 */

/** Top-level blocks [from, to) of the current document become `blocks`. */
export interface BlockChange {
  from: number;
  to: number;
  blocks: Node[];
}

/** One replacement to dispatch: positions in the document as it is when the frame plays. */
export interface AdoptionFrame {
  from: number;
  to: number;
  blocks: Node[];
}

/**
 * The block-level hunks turning `before` into `after`, in document order. Blocks compare by
 * ProseMirror equality, so a block the editor already holds is never re-typed because its
 * JSON spells attribute defaults differently from freshly parsed content.
 */
export function diffBlocks(before: Node[], after: Node[]): BlockChange[] {
  const changes: BlockChange[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let pending: BlockChange | null = null;

  for (const part of diffArrays(before, after, {
    comparator: (a, b) => a.eq(b),
  })) {
    const count = part.value.length;
    if (part.removed) {
      pending ??= { from: oldIndex, to: oldIndex, blocks: [] };
      pending.to += count;
      oldIndex += count;
    } else if (part.added) {
      pending ??= { from: oldIndex, to: oldIndex, blocks: [] };
      pending.blocks.push(...after.slice(newIndex, newIndex + count));
      newIndex += count;
    } else {
      if (pending) {
        changes.push(pending);
        pending = null;
      }
      oldIndex += count;
      newIndex += count;
    }
  }
  if (pending) {
    changes.push(pending);
  }
  return changes;
}

/**
 * The block with only its first `chars` characters of text, structure and marks kept, later
 * inline content dropped. A block with no text is returned whole.
 */
export function truncateBlock(block: JSONContent, chars: number): JSONContent {
  let remaining = chars;
  const visit = (node: JSONContent): JSONContent | null => {
    if (node.type === "text") {
      const text = node.text ?? "";
      if (remaining <= 0) {
        return null;
      }
      const kept = text.slice(0, remaining);
      remaining -= kept.length;
      return kept === text ? node : { ...node, text: kept };
    }
    if (!node.content) {
      return node;
    }
    const content: JSONContent[] = [];
    for (const child of node.content) {
      if (remaining <= 0 && content.length > 0) {
        break;
      }
      const kept = visit(child);
      if (kept !== null) {
        content.push(kept);
      }
    }
    return { ...node, content };
  };
  return visit(block) ?? { ...block, content: [] };
}

/** The blocks of a hunk with `revealed` characters shown: whole ones, then one cut, then none. */
function revealBlocks(
  schema: Schema,
  blocks: Node[],
  revealed: number
): Node[] {
  const shown: Node[] = [];
  let budget = revealed;
  for (const block of blocks) {
    const length = block.textContent.length;
    if (budget >= length) {
      shown.push(block);
      budget -= length;
      continue;
    }
    shown.push(schema.nodeFromJSON(truncateBlock(block.toJSON(), budget)));
    break;
  }
  return shown;
}

/** Characters of text a change brings in, the unit the reveal is paced by. */
export function insertedTextLength(changes: BlockChange[]): number {
  return changes.reduce(
    (total, change) =>
      total +
      change.blocks.reduce((sum, block) => sum + block.textContent.length, 0),
    0
  );
}

/**
 * The frames that turn `before` into `after`, each a replacement of top-level blocks at the
 * positions valid when it plays. Removed blocks go in the first frame of their hunk; new text
 * arrives `charsPerFrame` characters at a time. With no change, no frame.
 */
export function* adoptionFrames(
  schema: Schema,
  changes: BlockChange[],
  before: Node[],
  charsPerFrame: number
): Generator<AdoptionFrame> {
  const positionOf = (blocks: Node[], index: number): number =>
    blocks.slice(0, index).reduce((total, block) => total + block.nodeSize, 0);

  let current = [...before];
  let offset = 0;
  for (const change of changes) {
    const start = change.from + offset;
    let currentLength = change.to - change.from;
    const total = change.blocks.reduce(
      (sum, block) => sum + block.textContent.length,
      0
    );
    let revealed = 0;
    while (true) {
      const shown = revealBlocks(schema, change.blocks, revealed);
      const from = positionOf(current, start);
      const to = positionOf(current, start + currentLength);
      yield { from, to, blocks: shown };
      current = [
        ...current.slice(0, start),
        ...shown,
        ...current.slice(start + currentLength),
      ];
      currentLength = shown.length;
      if (revealed >= total) {
        break;
      }
      revealed = Math.min(total, revealed + Math.max(1, charsPerFrame));
    }
    offset += change.blocks.length - (change.to - change.from);
  }
}
