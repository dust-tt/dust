import type {
  EditHunk,
  PlayedEdit,
} from "@app/components/editor/document/AgentEdits";
import {
  agentEditsPlugin,
  withPlayedEdit,
} from "@app/components/editor/document/AgentEdits";
import { containsAttribution } from "@app/lib/live_attribution";
import type { LiveAttributionMessage } from "@app/types/collab";
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { ProsemirrorBinding, ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";

/**
 * Finds an agent's change among the shared document's updates, by the Yjs items the session
 * attributes to it, and where the editor shows it, so the playback shows exactly that change. Yjs v13
 * internals (`_start`, `_item`) and the binding's mapping: what Yjs v14 attribution replaces.
 */

/** How long an attribution may wait for its change before it is dropped. */
const ATTRIBUTION_WAIT_MS = 10_000;

/** A Yjs type the binding maps to the editor's nodes. */
type BoundType =
  ProsemirrorBinding["mapping"] extends Map<infer T, unknown> ? T : never;

/** The size in the editor's document of a block the binding shows, or null if it shows none. */
const blockSize = (
  binding: ProsemirrorBinding,
  type: BoundType
): number | null => {
  if (type instanceof Y.XmlText) {
    return type.length;
  }
  const node = binding.mapping.get(type);
  return node && !Array.isArray(node) ? node.nodeSize : null;
};

/** The size of the first `count` blocks of `type` the editor shows, or null if it shows one not. */
const blocksSize = (
  binding: ProsemirrorBinding,
  type: BoundType,
  count: number,
  until?: BoundType
): number | null => {
  let size = 0;
  let seen = 0;
  for (let item = type._start; item && seen < count; item = item.right) {
    if (!(item.content instanceof Y.ContentType)) {
      continue;
    }
    if (item.content.type === until) {
      break;
    }
    if (!item.deleted) {
      const block = blockSize(binding, item.content.type);
      if (block === null) {
        return null;
      }
      size += block;
      seen++;
    }
  }
  return size;
};

/**
 * The editor's position of a Yjs item, or null when the editor shows it nowhere. A deleted item
 * resolves to where it stood. As y-tiptap's `relativePositionToAbsolutePosition`, without its guard
 * against cursors misresolving to the document's start, which item ids never do.
 */
function itemPosition(
  binding: ProsemirrorBinding,
  client: number,
  clock: number
): number | null {
  const resolved = Y.createAbsolutePositionFromRelativePosition(
    Y.createRelativePositionFromJSON({ item: { client, clock }, assoc: 0 }),
    binding.doc
  );
  if (!resolved) {
    return null;
  }
  let type: BoundType = resolved.type;
  let position: number;
  if (type instanceof Y.XmlText) {
    position = resolved.index;
  } else {
    // Between blocks: past the ones before, inside `type`.
    const before = blocksSize(binding, type, resolved.index);
    if (before === null) {
      return null;
    }
    position = before + 1;
  }
  while (type !== binding.type) {
    const parent = type._item?.parent;
    if (!(parent instanceof Y.AbstractType) || parent._item?.deleted) {
      return null;
    }
    // Into `parent`, past the blocks before `type`.
    const before = blocksSize(binding, parent, Infinity, type);
    if (before === null) {
      return null;
    }
    position += 1 + before;
    type = parent;
  }
  // The fragment is the document itself, not a block in it.
  return position - 1;
}

/**
 * @cc [owner:PopDaph,label:product] live-attribution-hunks
 * The hunks MUST be exactly the attributed text as `binding` shows it, in document order: each
 * inserted text item still showing, at its place, and each removed text at its anchor's place.
 * Another author's text MUST NOT be part of them, wherever it stands, and items the editor shows
 * nowhere, such as text inside a block deleted meanwhile, nor formatting alone, MUST make none.
 */
export function attributionHunks(
  binding: ProsemirrorBinding,
  { inserted, removed }: LiveAttributionMessage
): EditHunk[] {
  const { store } = binding.doc;
  const hunks: EditHunk[] = [];
  for (const { client, clock, length } of inserted) {
    const structs = store.clients.get(client);
    if (!structs || Y.getState(store, client) <= clock) {
      continue;
    }
    const end = clock + length;
    for (
      let index = Y.findIndexSS(structs, clock);
      index < structs.length && structs[index].id.clock < end;
      index++
    ) {
      const item = structs[index];
      if (
        !(item instanceof Y.Item) ||
        item.deleted ||
        !(item.content instanceof Y.ContentString)
      ) {
        continue;
      }
      const from = Math.max(clock, item.id.clock);
      const to = Math.min(end, item.id.clock + item.length);
      const position = itemPosition(binding, client, from);
      if (position !== null) {
        hunks.push({
          inserted: [{ from: position, to: position + to - from }],
          at: position,
          removed: "",
        });
      }
    }
  }
  for (const { text, anchor } of removed) {
    const position = itemPosition(binding, anchor.client, anchor.clock);
    if (position !== null) {
      hunks.push({ inserted: [], at: position, removed: text });
    }
  }
  // Removed text first where text was replaced, so it fades where the new text is then typed.
  return hunks.sort(
    (a, b) => a.at - b.at || Number(a.removed === "") - Number(b.removed === "")
  );
}

/** The shared document and the attributions the session sends on it. */
export interface AttributionSource {
  document: Y.Doc;
  /** Whether a transaction of `document` applies what the session sent. */
  isSessionOrigin: (origin: unknown) => boolean;
  /** Each attribution the session sends, until the returned function is called. */
  onAttribution: (
    listener: (attribution: LiveAttributionMessage) => void
  ) => () => void;
}

/** The editor following the shared document: its document now, and an attribution's hunks in it. */
export interface AttributedEditor {
  doc: () => Node;
  hunks: (attribution: LiveAttributionMessage) => EditHunk[];
}

/**
 * @cc [owner:PopDaph,label:product] live-agent-edit-attribution
 * `play` MUST be called for a transaction of `source.document` that applies what the session sent
 * and holds attributed items (`containsAttribution`), with the attribution's author and its hunks
 * in the editor's document right after the transaction, and for no other transaction: a change is
 * played back as an agent's only for the items it holds, never because of when it arrived. A
 * transaction that leaves the editor's document unchanged, or whose attributed text the editor
 * shows nowhere, MUST NOT be played back. Each attribution MUST be dropped once matched, or after
 * `ATTRIBUTION_WAIT_MS`.
 */
export function followAttributions(
  source: AttributionSource,
  editor: AttributedEditor,
  play: (edit: PlayedEdit) => void
): () => void {
  let pending: { attribution: LiveAttributionMessage; receivedAt: number }[] =
    [];
  let before: Node | null = null;
  const onBeforeTransaction = (transaction: Y.Transaction) => {
    before = source.isSessionOrigin(transaction.origin) ? editor.doc() : null;
  };
  // The editor's binding applies the session's change while the transaction runs: the editor's
  // document and the binding's mapping are already the new ones here.
  const onAfterTransaction = (transaction: Y.Transaction) => {
    const docBefore = before;
    before = null;
    if (!docBefore || !source.isSessionOrigin(transaction.origin)) {
      return;
    }
    const now = Date.now();
    pending = pending.filter(
      ({ receivedAt }) => now - receivedAt <= ATTRIBUTION_WAIT_MS
    );
    const match = pending.find(({ attribution }) =>
      containsAttribution(transaction, attribution)
    );
    if (!match) {
      return;
    }
    pending = pending.filter((entry) => entry !== match);
    const doc = editor.doc();
    const hunks = doc === docBefore ? [] : editor.hunks(match.attribution);
    if (hunks.length > 0) {
      const { agentId, name } = match.attribution.author;
      // Once the transaction is over: the binding must not see the editor change inside it.
      queueMicrotask(() => play({ agent: { agentId, name }, hunks, doc }));
    }
  };
  source.document.on("beforeTransaction", onBeforeTransaction);
  source.document.on("afterTransaction", onAfterTransaction);
  const stop = source.onAttribution((attribution) => {
    pending = [...pending, { attribution, receivedAt: Date.now() }];
  });
  return () => {
    source.document.off("beforeTransaction", onBeforeTransaction);
    source.document.off("afterTransaction", onAfterTransaction);
    stop();
  };
}

export const agentEdits = (source: AttributionSource) =>
  Extension.create<Record<string, never>, { unsubscribe: (() => void) | null }>(
    {
      name: "agentEdits",
      addStorage: () => ({ unsubscribe: null }),
      onCreate() {
        this.storage.unsubscribe = followAttributions(
          source,
          {
            doc: () => this.editor.state.doc,
            hunks: (attribution) => {
              const binding = ySyncPluginKey.getState(
                this.editor.state
              )?.binding;
              return binding instanceof ProsemirrorBinding
                ? attributionHunks(binding, attribution)
                : [];
            },
          },
          (edit) => {
            if (!this.editor.isDestroyed) {
              this.editor.view.dispatch(
                withPlayedEdit(this.editor.state, edit)
              );
            }
          }
        );
      },
      onDestroy() {
        this.storage.unsubscribe?.();
      },
      addProseMirrorPlugins() {
        return [agentEditsPlugin()];
      },
    }
  );
