import type {
  LiveAttributionMessage,
  LiveAuthor,
  LiveIdRange,
} from "@app/types/collab";
import {
  LIVE_ATTRIBUTION_MAX_RANGES,
  LIVE_REMOVED_TEXT_MAX_CHARS,
} from "@app/types/collab";
import * as Y from "yjs";

/** The Yjs items a change inserted and deleted. */
export type AttributedItems = Pick<
  LiveAttributionMessage,
  "inserted" | "deleted"
>;

type RemovedText = LiveAttributionMessage["removed"][number];

/** Every item `transaction` inserted and every item it deleted. */
export function transactionItems(transaction: Y.Transaction): AttributedItems {
  const inserted: LiveIdRange[] = [];
  transaction.afterState.forEach((after, client) => {
    const before = transaction.beforeState.get(client) ?? 0;
    if (after > before) {
      inserted.push({ client, clock: before, length: after - before });
    }
  });
  const deleted: LiveIdRange[] = [];
  transaction.deleteSet.clients.forEach((items, client) => {
    for (const { clock, len } of items) {
      deleted.push({ client, clock, length: len });
    }
  });
  return { inserted, deleted };
}

/** The outermost deleted item holding `item`, `item` itself for a deleted block, or null. */
function deletedBlock(item: Y.Item): Y.Item | null {
  let block = item.content instanceof Y.ContentType ? item : null;
  let parent = item.parent;
  while (parent instanceof Y.AbstractType && parent._item) {
    if (parent._item.deleted) {
      block = parent._item;
    }
    parent = parent._item.parent;
  }
  return block;
}

/** The text of `type`, in document order, blocks separated by a space. */
function typeText(type: Y.AbstractType<unknown>): string {
  const parts: string[] = [];
  for (let item = type._start; item; item = item.right) {
    if (item.content instanceof Y.ContentString) {
      parts.push(item.content.str);
    } else if (item.content instanceof Y.ContentType) {
      parts.push(` ${typeText(item.content.type)}`);
    }
  }
  return parts.join("").trim();
}

const capped = (text: string) => text.slice(0, LIVE_REMOVED_TEXT_MAX_CHARS + 1);

/**
 * The text `transaction` deleted, read before Yjs collects it: each deleted block whole, anchored
 * at the block, and each run of text deleted inside a block that stays, anchored at its first
 * item. Only callable while the transaction runs, in an observer.
 */
export function removedTexts(transaction: Y.Transaction): RemovedText[] {
  const blocks = new Set<Y.Item>();
  const inline = new Set<Y.Item>();
  Y.iterateDeletedStructs(transaction, transaction.deleteSet, (struct) => {
    if (!(struct instanceof Y.Item)) {
      return;
    }
    const block = deletedBlock(struct);
    if (block) {
      blocks.add(block);
    } else if (struct.content instanceof Y.ContentString) {
      inline.add(struct);
    }
  });

  const removed: RemovedText[] = [];
  for (const block of blocks) {
    const text =
      block.content instanceof Y.ContentType
        ? typeText(block.content.type)
        : "";
    if (text !== "") {
      removed.push({ text: capped(text), anchor: { ...block.id } });
    }
  }
  for (const start of inline) {
    if (start.left instanceof Y.Item && inline.has(start.left)) {
      continue;
    }
    let text = "";
    for (
      let item: Y.Item | null = start;
      item && inline.has(item);
      item = item.right
    ) {
      if (item.content instanceof Y.ContentString) {
        text += item.content.str;
      }
    }
    removed.push({ text: capped(text), anchor: { ...start.id } });
  }
  return removed;
}

/**
 * @cc [owner:PopDaph,label:product] live-attribution
 * `attributeTransaction` MUST name every item `transaction` inserted and deleted and the text it
 * removed (`removedTexts`), or return null past `LIVE_ATTRIBUTION_MAX_RANGES`, so editors never
 * show a part of a change as the whole. `containsAttribution` MUST be true exactly when
 * `transaction` inserted or deleted one of the attributed items: a change is attributed by the items
 * it holds, never by when it arrives.
 */
export function attributeTransaction(
  transaction: Y.Transaction,
  author: LiveAuthor,
  at: number
): LiveAttributionMessage | null {
  const { inserted, deleted } = transactionItems(transaction);
  const removed = removedTexts(transaction);
  if (
    inserted.length > LIVE_ATTRIBUTION_MAX_RANGES ||
    deleted.length > LIVE_ATTRIBUTION_MAX_RANGES ||
    removed.length > LIVE_ATTRIBUTION_MAX_RANGES
  ) {
    return null;
  }
  return { type: "attribution", author, at, inserted, deleted, removed };
}

export function containsAttribution(
  transaction: Y.Transaction,
  { inserted, deleted }: AttributedItems
): boolean {
  return (
    inserted.some(({ client, clock, length }) => {
      const before = transaction.beforeState.get(client) ?? 0;
      const after = transaction.afterState.get(client) ?? 0;
      return before < clock + length && after > clock;
    }) ||
    deleted.some(({ client, clock, length }) =>
      (transaction.deleteSet.clients.get(client) ?? []).some(
        (item) => item.clock < clock + length && item.clock + item.len > clock
      )
    )
  );
}
