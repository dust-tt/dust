import type {
  LiveAttributionMessage,
  LiveAuthor,
  LiveIdRange,
} from "@app/types/collab";
import {
  LIVE_ATTRIBUTION_MAX_RANGES,
  LIVE_ATTRIBUTION_MAX_REMOVED,
  LIVE_REMOVED_TEXT_MAX_CHARS,
} from "@app/types/collab";
import * as Y from "yjs";

/*
 * Attributes a change of a shared document by its Yjs items, for the collab server, and matches
 * transactions to attributions, for editors. Reads Yjs v13 internals (`_item`, `_start`): what Yjs
 * v14's attribution manager replaces.
 */

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
 * The text `transaction` deleted, read before Yjs collects it, in document order: each run of
 * deleted text and deleted blocks inside a block that stays, anchored at its first item. Formatting
 * and text deleted earlier neither join nor split a run. Only callable while the transaction runs,
 * in an observer.
 */
export function removedTexts(transaction: Y.Transaction): RemovedText[] {
  // The outermost items the transaction deleted, and the blocks that stay holding them.
  const deleted = new Set<Y.Item>();
  const parents = new Set<Y.AbstractType<unknown>>();
  Y.iterateDeletedStructs(transaction, transaction.deleteSet, (struct) => {
    if (!(struct instanceof Y.Item)) {
      return;
    }
    const item =
      deletedBlock(struct) ??
      (struct.content instanceof Y.ContentString ? struct : null);
    if (item && item.parent instanceof Y.AbstractType) {
      deleted.add(item);
      parents.add(item.parent);
    }
  });

  const removed: RemovedText[] = [];
  for (const parent of parents) {
    let run: { text: string; anchor: Y.Item; afterBlock: boolean } | null =
      null;
    const endRun = () => {
      if (run && run.text !== "") {
        removed.push({ text: capped(run.text), anchor: { ...run.anchor.id } });
      }
      run = null;
    };
    for (let item = parent._start; item; item = item.right) {
      if (deleted.has(item)) {
        const isBlock = item.content instanceof Y.ContentType;
        const part =
          item.content instanceof Y.ContentString
            ? item.content.str
            : item.content instanceof Y.ContentType
              ? typeText(item.content.type)
              : "";
        if (!run) {
          run = { text: part, anchor: item, afterBlock: isBlock };
        } else {
          // Blocks stay apart by a space, text runs on.
          run.text += isBlock || run.afterBlock ? ` ${part}` : part;
          run.afterBlock = isBlock;
        }
      } else if (!item.deleted && item.countable) {
        endRun();
      }
    }
    endRun();
  }
  return removed;
}

/**
 * @cc [owner:PopDaph,label:product] live-attribution
 * `attributeTransaction` MUST name every item `transaction` inserted and deleted, or return null
 * past `LIVE_ATTRIBUTION_MAX_RANGES`, so editors never show a part of a change as the whole, and the
 * first `LIVE_ATTRIBUTION_MAX_REMOVED` texts it removed (`removedTexts`), a preview. `containsAttribution` MUST be true exactly when
 * `transaction` inserted or deleted one of the attributed items: a change is attributed by the items
 * it holds, never by when it arrives.
 */
export function attributeTransaction(
  transaction: Y.Transaction,
  author: LiveAuthor,
  at: number
): LiveAttributionMessage | null {
  const { inserted, deleted } = transactionItems(transaction);
  if (
    inserted.length > LIVE_ATTRIBUTION_MAX_RANGES ||
    deleted.length > LIVE_ATTRIBUTION_MAX_RANGES
  ) {
    return null;
  }
  const removed = removedTexts(transaction).slice(
    0,
    LIVE_ATTRIBUTION_MAX_REMOVED
  );
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
