import { onLiveAgentEdit } from "@app/lib/client/live_agents";
import { liveCaretColor } from "@app/lib/client/live_session";
import datadogLogger from "@app/logger/datadogLogger";
import type { LiveAgent, LiveIdRange } from "@app/types/collab";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ProsemirrorBinding, ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";

/**
 * When an agent edits a live document, the text its change inserted glows in the agent's color,
 * then fades. The session names that text by its Yjs item ids (`agent_edit`), so only the agent's
 * own text glows, never text someone typed at the same time. Presentation only: decorations, never
 * a change of the document.
 */

// The duration of `animate-agent-edit-settle` (theme-extras.css): the browser runs the fade, the
// plugin only removes the decorations once it is done.
const GLOW_MS = 1_200;
const GLOW_PERCENT = 25;
/** Inserted characters past which an edit just shows, without a glow. */
const MAX_GLOWED_CHARS = 20_000;

interface TextRange {
  from: number;
  to: number;
}

/** The text an agent's change inserted, as `ranges` of `doc`. */
export interface AgentEditGlow {
  agent: LiveAgent;
  ranges: TextRange[];
  doc: Node;
}

interface Glow {
  agent: LiveAgent;
  ranges: TextRange[];
  startedAt: number;
}

type AgentEditsMeta = ({ type: "glow" } & AgentEditGlow) | { type: "end" };

const agentEditsKey = new PluginKey<Glow | null>("agentEdits");

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

/** Each type's child items at their offset inside it, computed once per resolution. */
type Offsets = Map<BoundType, Map<Y.Item, number>>;

/**
 * Where each child item of `type` starts inside it, in the editor's positions: text by its length,
 * blocks by the size of their node. Stops at a block the editor shows nowhere.
 */
const childOffsets = (
  binding: ProsemirrorBinding,
  type: BoundType,
  cache: Offsets
): Map<Y.Item, number> => {
  const cached = cache.get(type);
  if (cached) {
    return cached;
  }
  const offsets = new Map<Y.Item, number>();
  let offset = 0;
  for (let item = type._start; item; item = item.right) {
    offsets.set(item, offset);
    if (item.deleted) {
      continue;
    }
    if (item.content instanceof Y.ContentType) {
      const size = blockSize(binding, item.content.type);
      if (size === null) {
        break;
      }
      offset += size;
    } else if (item.countable) {
      offset += item.length;
    }
  }
  cache.set(type, offsets);
  return offsets;
};

/**
 * The editor's position of the character at `clock` in the text item `item`, or null when the
 * editor shows it nowhere, such as inside a deleted block. As y-tiptap's
 * `relativePositionToAbsolutePosition`, without its guard against cursors misresolving to the
 * document's start, which item ids never do, and with each type's offsets computed once.
 */
function textItemPosition(
  binding: ProsemirrorBinding,
  item: Y.Item,
  clock: number,
  cache: Offsets
): number | null {
  if (!(item.parent instanceof Y.XmlText)) {
    return null;
  }
  let type: BoundType = item.parent;
  const inText = childOffsets(binding, type, cache).get(item);
  if (inText === undefined) {
    return null;
  }
  let position = inText + clock - item.id.clock;
  while (type !== binding.type) {
    const typeItem = type._item;
    const parent = typeItem?.parent;
    if (!typeItem || typeItem.deleted || !(parent instanceof Y.AbstractType)) {
      return null;
    }
    // Into `parent`, past the blocks before `type`.
    const offset = childOffsets(binding, parent, cache).get(typeItem);
    if (offset === undefined) {
      return null;
    }
    position += 1 + offset;
    type = parent;
  }
  // The fragment is the document itself, not a block in it.
  return position - 1;
}

/**
 * @cc [owner:PopDaph,label:product] live-agent-edit-ranges
 * The ranges MUST be exactly the text of the `inserted` items that `binding` shows, in document
 * order: each surviving text item clamped to its range, since items of one client merge across
 * changes. Items not integrated yet, deleted, inside a deleted block, or formatting alone MUST make
 * none.
 */
export function insertedTextRanges(
  binding: ProsemirrorBinding,
  inserted: LiveIdRange[]
): TextRange[] {
  const { store } = binding.doc;
  const cache: Offsets = new Map();
  const ranges: TextRange[] = [];
  for (const { client, clock, length } of inserted) {
    const structs = store.clients.get(client);
    const end = Math.min(clock + length, Y.getState(store, client));
    if (!structs || clock >= end) {
      continue;
    }
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
      const position = textItemPosition(binding, item, from, cache);
      if (position !== null) {
        ranges.push({ from: position, to: position + to - from });
      }
    }
  }
  return ranges.sort((a, b) => a.from - b.from);
}

/** A transaction glowing `glow`, whose ranges are in the document it applies to. */
export const withAgentEditGlow = (
  state: EditorState,
  glow: AgentEditGlow
): Transaction => {
  const meta: AgentEditsMeta = { type: "glow", ...glow };
  return state.tr.setMeta(agentEditsKey, meta);
};

const applyAgentEdits = (
  transaction: Transaction,
  glow: Glow | null,
  _oldState: EditorState,
  newState: EditorState
): Glow | null => {
  const meta: AgentEditsMeta | undefined = transaction.getMeta(agentEditsKey);
  if (meta?.type === "glow") {
    // Only while its ranges are this document's: otherwise the text just shows.
    return meta.doc === newState.doc
      ? { agent: meta.agent, ranges: meta.ranges, startedAt: Date.now() }
      : glow;
  }
  // Any later change, or the fade's end, removes the glow: no tracking through other changes.
  if (meta?.type === "end" || transaction.docChanged) {
    return null;
  }
  return glow;
};

const glowDecorations = (doc: Node, { agent, ranges }: Glow) => {
  const highlight = `color-mix(in srgb, ${liveCaretColor(agent.agentId)} ${GLOW_PERCENT}%, transparent)`;
  return DecorationSet.create(
    doc,
    ranges.map(({ from, to }) =>
      Decoration.inline(
        from,
        to,
        {
          class: "animate-agent-edit-settle",
          style: `--agent-edit-highlight: ${highlight}; border-radius: 2px`,
        },
        { agentEdit: "glow" }
      )
    )
  );
};

/**
 * @cc [owner:PopDaph,label:product;performance] live-agent-edit-glow
 * A glow given by `withAgentEditGlow`, while its ranges are in the current document, MUST show
 * those ranges in the agent's color fading in CSS, with decorations unchanged while it runs, then
 * none after `GLOW_MS`. It MUST only add decorations, never change the document, the selection or
 * undo history, and MUST end at once on any later change of the document.
 */
export const agentEditsPlugin = () =>
  new Plugin<Glow | null>({
    key: agentEditsKey,
    state: {
      init: () => null,
      apply: applyAgentEdits,
    },
    props: {
      decorations: (state) => {
        const glow = agentEditsKey.getState(state);
        return glow ? glowDecorations(state.doc, glow) : DecorationSet.empty;
      },
    },
    view: (view) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let timed: Glow | null = null;
      const schedule = () => {
        const glow = agentEditsKey.getState(view.state) ?? null;
        if (glow === timed) {
          return;
        }
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        timed = glow;
        if (glow) {
          timer = setTimeout(() => {
            timer = null;
            if (!view.isDestroyed) {
              const meta: AgentEditsMeta = { type: "end" };
              view.dispatch(view.state.tr.setMeta(agentEditsKey, meta));
            }
          }, GLOW_MS);
        }
      };
      return {
        update: schedule,
        destroy: () => {
          if (timer !== null) {
            clearTimeout(timer);
          }
        },
      };
    },
  });

/**
 * @cc [owner:PopDaph,label:product] live-agent-edit-shown
 * Each agent edit the session announces on `provider` MUST glow the text it inserted
 * (`insertedTextRanges`) in the document as it is when the announcement arrives, unless it inserted
 * more than `MAX_GLOWED_CHARS` characters. A failure resolving it MUST only skip the glow, logged.
 */
export const agentEdits = (provider: HocuspocusProvider) =>
  Extension.create<Record<string, never>, { unsubscribe: (() => void) | null }>(
    {
      name: "agentEdits",
      addStorage: () => ({ unsubscribe: null }),
      onCreate() {
        this.storage.unsubscribe = onLiveAgentEdit(provider, (edit) => {
          const length = edit.inserted.reduce(
            (total, range) => total + range.length,
            0
          );
          if (this.editor.isDestroyed || length > MAX_GLOWED_CHARS) {
            return;
          }
          try {
            const binding = ySyncPluginKey.getState(this.editor.state)?.binding;
            if (!(binding instanceof ProsemirrorBinding)) {
              return;
            }
            const ranges = insertedTextRanges(binding, edit.inserted);
            if (ranges.length > 0) {
              this.editor.view.dispatch(
                withAgentEditGlow(this.editor.state, {
                  agent: edit.agent,
                  ranges,
                  doc: this.editor.state.doc,
                })
              );
            }
          } catch (err) {
            datadogLogger.warn(
              { error: normalizeError(err).message },
              "Could not show an agent's edit"
            );
          }
        });
      },
      onDestroy() {
        this.storage.unsubscribe?.();
      },
      addProseMirrorPlugins() {
        return [agentEditsPlugin()];
      },
    }
  );
