import type { LiveAgentEvent } from "@app/lib/client/live_agents";
import { liveCaretColor } from "@app/lib/client/live_session";
import type { LiveAgent } from "@app/types/collab";
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { diffArrays } from "diff";

/**
 * An agent's change to a live document lands whole in the shared document. This plays it back for
 * the people watching: the text it removed fades out where it stood, the text it wrote appears as
 * if typed behind the agent's caret, then its highlight settles. Presentation only: the document
 * holds the whole change from the start, so saving, undo and other editors are unaffected.
 */

/** How long after an `editing` message the agent's change may still arrive. */
const EXPECT_CHANGE_MS = 3_000;
const REMOVED_FADE_MS = 350;
const TYPING_MS_PER_CHAR = 6;
const MIN_TYPING_MS = 250;
const MAX_TYPING_MS = 1_500;
const SETTLE_MS = 1_200;
const FRAME_MS = 50;
const REMOVED_PREVIEW_MAX_CHARS = 240;
/** Changed blocks past which a change is diffed as one rewrite. */
const MAX_BLOCK_EDITS = 200;
const TYPING_HIGHLIGHT_PERCENT = 25;

interface TextRange {
  from: number;
  to: number;
}

/** One place the change touched, in the current document's positions. */
export interface EditHunk {
  /** The text it wrote, in document order. */
  inserted: TextRange[];
  /** Where the text it removed stood, and that text. */
  at: number;
  removed: string;
}

interface EditAnimation {
  agent: LiveAgent;
  color: string;
  startedAt: number;
  fadeMs: number;
  typingMs: number;
  hunks: EditHunk[];
}

interface AgentEditsState {
  expected: { agent: LiveAgent; until: number } | null;
  animation: EditAnimation | null;
}

type AgentEditsMeta =
  | { type: "expect"; agent: LiveAgent }
  | { type: "cancel" }
  | { type: "frame" };

const agentEditsKey = new PluginKey<AgentEditsState>("agentEdits");

const EMPTY_STATE: AgentEditsState = { expected: null, animation: null };

const rangeLength = ({ from, to }: TextRange) => to - from;

const textLength = (hunks: EditHunk[]) =>
  hunks.reduce(
    (total, hunk) =>
      total + hunk.inserted.reduce((sum, range) => sum + rangeLength(range), 0),
    0
  );

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** The text ranges between `from` and `to` in `doc`. */
const textRanges = (doc: Node, from: number, to: number): TextRange[] => {
  const ranges: TextRange[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      ranges.push({
        from: Math.max(pos, from),
        to: Math.min(pos + node.nodeSize, to),
      });
    }
  });
  return ranges.filter((range) => rangeLength(range) > 0);
};

/** The hunk turning blocks `before` into `after`, narrowed to what differs inside them. */
function narrowHunk(
  before: { doc: Node; blocks: Node[]; from: number },
  after: { doc: Node; blocks: Node[]; from: number }
): EditHunk | null {
  const oldContent = Fragment.fromArray(before.blocks);
  const newContent = Fragment.fromArray(after.blocks);
  const start = oldContent.findDiffStart(newContent);
  const end = oldContent.findDiffEnd(newContent);
  if (start === null || end === null) {
    return null;
  }
  // Repeated content can make the end land before the start; both sides move back alike.
  const overlap = Math.max(0, start - Math.min(end.a, end.b));
  const removedFrom = before.from + start;
  const removedTo = before.from + end.a + overlap;
  const insertedFrom = after.from + start;
  const insertedTo = after.from + end.b + overlap;

  // Only marks or block boundaries changed, such as a comment anchored by the change: the text is
  // the same once read without separators between blocks.
  if (
    before.doc.textBetween(removedFrom, removedTo, "", "") ===
    after.doc.textBetween(insertedFrom, insertedTo, "", "")
  ) {
    return null;
  }
  return {
    inserted: textRanges(after.doc, insertedFrom, insertedTo),
    at: insertedFrom,
    removed: before.doc.textBetween(removedFrom, removedTo, " ", " "),
  };
}

/**
 * @cc [owner:PopDaph,label:product] agent-edit-hunks
 * The hunks MUST cover every place where `after` differs from `before` in text, in document order,
 * each narrowed to the characters that differ, with positions in `after`. A change of marks or
 * structure alone MUST NOT make a hunk. A change of more than `MAX_BLOCK_EDITS` blocks MAY be one
 * hunk, so the diff stays bounded.
 */
export function diffAgentEdit(before: Node, after: Node): EditHunk[] {
  const oldBlocks: Node[] = [];
  const newBlocks: Node[] = [];
  const oldPositions: number[] = [];
  const newPositions: number[] = [];
  before.forEach((block, offset) => {
    oldBlocks.push(block);
    oldPositions.push(offset);
  });
  after.forEach((block, offset) => {
    newBlocks.push(block);
    newPositions.push(offset);
  });
  oldPositions.push(before.content.size);
  newPositions.push(after.content.size);

  // The block diff is quadratic in the blocks that changed: past the bound, the change is a rewrite
  // and plays back as one hunk.
  const parts = diffArrays(oldBlocks, newBlocks, {
    comparator: (a, b) => a.eq(b),
    maxEditLength: MAX_BLOCK_EDITS,
  });
  if (parts === undefined) {
    const hunk = narrowHunk(
      { doc: before, blocks: oldBlocks, from: 0 },
      { doc: after, blocks: newBlocks, from: 0 }
    );
    return hunk ? [hunk] : [];
  }

  const hunks: EditHunk[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let pending: {
    oldFrom: number;
    oldTo: number;
    newFrom: number;
    newTo: number;
  } | null = null;
  const flush = () => {
    if (!pending) {
      return;
    }
    const hunk = narrowHunk(
      {
        doc: before,
        blocks: oldBlocks.slice(pending.oldFrom, pending.oldTo),
        from: oldPositions[pending.oldFrom],
      },
      {
        doc: after,
        blocks: newBlocks.slice(pending.newFrom, pending.newTo),
        from: newPositions[pending.newFrom],
      }
    );
    if (hunk) {
      hunks.push(hunk);
    }
    pending = null;
  };

  for (const part of parts) {
    const count = part.value.length;
    if (part.removed || part.added) {
      pending ??= {
        oldFrom: oldIndex,
        oldTo: oldIndex,
        newFrom: newIndex,
        newTo: newIndex,
      };
      if (part.removed) {
        oldIndex += count;
        pending.oldTo = oldIndex;
      } else {
        newIndex += count;
        pending.newTo = newIndex;
      }
    } else {
      flush();
      oldIndex += count;
      newIndex += count;
    }
  }
  flush();
  return hunks;
}

const startAnimation = (
  agent: LiveAgent,
  hunks: EditHunk[],
  now: number
): EditAnimation | null => {
  if (hunks.length === 0) {
    return null;
  }
  const still = prefersReducedMotion();
  const length = textLength(hunks);
  return {
    agent,
    color: liveCaretColor(agent.agentId),
    startedAt: now,
    fadeMs:
      still || hunks.every((hunk) => hunk.removed === "") ? 0 : REMOVED_FADE_MS,
    typingMs: still
      ? 0
      : Math.min(
          MAX_TYPING_MS,
          Math.max(MIN_TYPING_MS, length * TYPING_MS_PER_CHAR)
        ),
    hunks,
  };
};

const endsAt = (animation: EditAnimation) =>
  animation.startedAt + animation.fadeMs + animation.typingMs + SETTLE_MS;

type MapPosition = (position: number, assoc: -1 | 1) => number;

/** Where `before` and `after` differ: from `start`, up to `oldEnd` in `before` and `newEnd` in `after`. */
interface ChangedRegion {
  start: number;
  oldEnd: number;
  newEnd: number;
}

const changedRegion = (before: Node, after: Node): ChangedRegion | null => {
  const start = before.content.findDiffStart(after.content);
  const end = before.content.findDiffEnd(after.content);
  if (start === null || end === null) {
    return null;
  }
  // Repeated content can make the end land before the start; both sides move back alike.
  const overlap = Math.max(0, start - Math.min(end.a, end.b));
  return { start, oldEnd: end.a + overlap, newEnd: end.b + overlap };
};

/**
 * Positions moved through the region that changed. The Yjs binding applies a change from Yjs as a
 * single step replacing the whole document, whose mapping would send every position to an edge.
 */
const regionMapping =
  ({ start, oldEnd, newEnd }: ChangedRegion): MapPosition =>
  (position, assoc) => {
    if (position < start) {
      return position;
    }
    if (position > oldEnd) {
      return position + newEnd - oldEnd;
    }
    if (position === start && start !== oldEnd) {
      return start;
    }
    if (position === oldEnd && start !== oldEnd) {
      return newEnd;
    }
    return assoc < 0 ? start : newEnd;
  };

/** Whether the region changed text the agent wrote, which can no longer be told apart from it. */
const touchesAnimation = (
  animation: EditAnimation,
  { start, oldEnd }: ChangedRegion
) =>
  animation.hunks.some((hunk) =>
    hunk.inserted.some(({ from, to }) => start < to && oldEnd > from)
  );

const mapAnimation = (
  animation: EditAnimation,
  map: MapPosition
): EditAnimation => ({
  ...animation,
  hunks: animation.hunks.map((hunk) => ({
    // Text typed at an edge of the agent's text is not the agent's: the range does not grow.
    inserted: hunk.inserted
      .map(({ from, to }) => ({ from: map(from, 1), to: map(to, -1) }))
      .filter((range) => rangeLength(range) > 0),
    at: map(hunk.at, 1),
    removed: hunk.removed,
  })),
});

/** A change from another editor or the server, not the local user's own undo or redo. */
const isRemoteChange = (transaction: Transaction) => {
  const sync = transaction.getMeta(ySyncPluginKey);
  return (
    transaction.docChanged &&
    sync?.isChangeOrigin === true &&
    sync?.isUndoRedoOperation !== true
  );
};

const applyAgentEdits = (
  transaction: Transaction,
  state: AgentEditsState,
  oldState: EditorState,
  newState: EditorState
): AgentEditsState => {
  const now = Date.now();
  const meta: AgentEditsMeta | undefined = transaction.getMeta(agentEditsKey);
  let { expected, animation } = state;

  if (meta?.type === "expect") {
    expected = { agent: meta.agent, until: now + EXPECT_CHANGE_MS };
  } else if (meta?.type === "cancel") {
    expected = null;
  }
  if (expected && expected.until < now) {
    expected = null;
  }

  if (expected && isRemoteChange(transaction)) {
    // A new change replaces one still playing: its text is shown whole.
    animation = startAnimation(
      expected.agent,
      diffAgentEdit(oldState.doc, newState.doc),
      now
    );
    expected = null;
  } else if (animation && transaction.docChanged) {
    const region = changedRegion(oldState.doc, newState.doc);
    if (region && touchesAnimation(animation, region)) {
      // Someone changed the agent's text while it played: it all shows at once.
      animation = null;
    } else if (region) {
      animation = mapAnimation(animation, regionMapping(region));
    }
  }
  if (animation && endsAt(animation) <= now) {
    animation = null;
  }
  return expected === state.expected && animation === state.animation
    ? state
    : { expected, animation };
};

/** Non-negative, to two decimals, so decorations only change when what they draw does. */
const roundPositive = (value: number) =>
  Math.round(Math.max(0, value) * 100) / 100;

const caretWidget = (animation: EditAnimation) => () => {
  const caret = document.createElement("span");
  caret.className = "collaboration-carets__caret";
  caret.setAttribute("aria-hidden", "true");
  caret.style.borderColor = animation.color;
  const label = document.createElement("span");
  label.className = "collaboration-carets__label";
  label.style.backgroundColor = animation.color;
  label.textContent = animation.agent.name;
  caret.append(label);
  return caret;
};

const removedWidget = (text: string, opacity: number) => () => {
  const removed = document.createElement("span");
  removed.setAttribute("aria-hidden", "true");
  removed.className = "line-through decoration-2 text-muted-foreground";
  removed.style.opacity = String(opacity);
  removed.textContent =
    text.length > REMOVED_PREVIEW_MAX_CHARS
      ? `${text.slice(0, REMOVED_PREVIEW_MAX_CHARS)}…`
      : text;
  return removed;
};

/** The frame of `animation` at `now`. */
function animationDecorations(
  doc: Node,
  animation: EditAnimation,
  now: number
): DecorationSet {
  const elapsed = now - animation.startedAt;
  const typed = Math.max(0, elapsed - animation.fadeMs);
  const typingDone = typed >= animation.typingMs;
  const settled = typingDone
    ? Math.min(1, (typed - animation.typingMs) / SETTLE_MS)
    : 0;
  const total = textLength(animation.hunks);
  let budget =
    animation.typingMs === 0
      ? total
      : Math.round(total * Math.min(1, typed / animation.typingMs));
  const highlight = `color-mix(in srgb, ${animation.color} ${roundPositive(
    TYPING_HIGHLIGHT_PERCENT * (1 - settled)
  )}%, transparent)`;

  const decorations: Decoration[] = [];
  let caretAt: number | null = null;
  animation.hunks.forEach((hunk, index) => {
    if (elapsed < animation.fadeMs && hunk.removed !== "") {
      const opacity = roundPositive(1 - elapsed / animation.fadeMs);
      decorations.push(
        Decoration.widget(hunk.at, removedWidget(hunk.removed, opacity), {
          side: -1,
          key: `agent-removed-${index}-${opacity}`,
        })
      );
    }
    for (const range of hunk.inserted) {
      const shown = Math.min(rangeLength(range), budget);
      budget -= shown;
      if (shown > 0) {
        decorations.push(
          Decoration.inline(
            range.from,
            range.from + shown,
            { style: `background-color: ${highlight}; border-radius: 2px` },
            { agentEdit: "shown" }
          )
        );
      }
      if (shown < rangeLength(range)) {
        caretAt ??= range.from + shown;
        decorations.push(
          Decoration.inline(
            range.from + shown,
            range.to,
            // Takes no space until typed, so the text after it moves along as it is typed.
            { style: "display: none" },
            { agentEdit: "hidden" }
          )
        );
      }
    }
  });

  if (!typingDone && caretAt !== null && elapsed >= animation.fadeMs) {
    decorations.push(
      Decoration.widget(caretAt, caretWidget(animation), {
        side: -1,
        key: `agent-caret-${animation.agent.agentId}`,
      })
    );
  }
  return DecorationSet.create(doc, decorations);
}

/** Announces the agents' activity to `listener` until the returned function is called. */
export type OnAgentActivity = (
  listener: (event: LiveAgentEvent) => void
) => () => void;

/** Expects an agent's change, after the session announced it editing, or stops expecting one. */
export const withAgentActivity = (
  transaction: Transaction,
  { agent, activity }: LiveAgentEvent
): Transaction => {
  const meta: AgentEditsMeta =
    activity === "editing" ? { type: "expect", agent } : { type: "cancel" };
  return transaction.setMeta(agentEditsKey, meta);
};

/**
 * @cc [owner:PopDaph,label:product] live-agent-edit-playback
 * After the session announces an agent editing, the next remote change of the shared document
 * within `EXPECT_CHANGE_MS` MUST be played back as that agent's: its removed text fading where it
 * stood, then its new text revealed in document order behind a caret labelled with the agent's
 * name, then highlighted until it settles. Playback MUST only add decorations, never change the
 * document, the selection or undo history, and MUST follow later changes of the document, ending at
 * once, its new text all shown, when a later change touches that text. A change
 * of marks alone, the local user's own changes, undo and redo MUST NOT be played back. With reduced
 * motion, the new text MUST show at once, highlighted until it settles.
 */
export const agentEditsPlugin = () =>
  new Plugin<AgentEditsState>({
    key: agentEditsKey,
    state: {
      init: () => EMPTY_STATE,
      apply: applyAgentEdits,
    },
    props: {
      decorations: (state) => {
        const animation = agentEditsKey.getState(state)?.animation;
        return animation
          ? animationDecorations(state.doc, animation, Date.now())
          : DecorationSet.empty;
      },
    },
    // Frames are transactions that change nothing but the time the decorations are drawn at.
    view: (view) => {
      let frame: ReturnType<typeof setTimeout> | null = null;
      const schedule = () => {
        if (frame !== null || !agentEditsKey.getState(view.state)?.animation) {
          return;
        }
        frame = setTimeout(() => {
          frame = null;
          if (!view.isDestroyed) {
            const meta: AgentEditsMeta = { type: "frame" };
            view.dispatch(view.state.tr.setMeta(agentEditsKey, meta));
          }
        }, FRAME_MS);
      };
      schedule();
      return {
        update: schedule,
        destroy: () => {
          if (frame !== null) {
            clearTimeout(frame);
          }
        },
      };
    },
  });

export const agentEdits = (onActivity: OnAgentActivity) =>
  Extension.create<Record<string, never>, { unsubscribe: (() => void) | null }>(
    {
      name: "agentEdits",
      addStorage: () => ({ unsubscribe: null }),
      onCreate() {
        this.storage.unsubscribe = onActivity((event) => {
          if (!this.editor.isDestroyed) {
            this.editor.view.dispatch(
              withAgentActivity(this.editor.state.tr, event)
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
