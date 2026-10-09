import { liveCaretColor } from "@app/lib/client/live_session";
import type { LiveAgent } from "@app/types/collab";
import { LIVE_REMOVED_TEXT_MAX_CHARS } from "@app/types/collab";
import type { Node } from "@tiptap/pm/model";
import type { Fragment } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * An agent's change to a live document lands whole in the shared document. This plays it back for
 * the people watching: the text it removed fades out where it stood, the text it wrote appears as
 * if typed behind the agent's caret, then its highlight settles. Presentation only: the document
 * holds the whole change from the start, so saving, undo and other editors are unaffected.
 */

// The durations of `animate-agent-edit-removed` and `animate-agent-edit-settle` (theme-extras.css):
// the browser runs both, the plugin only removes them once done.
const REMOVED_FADE_MS = 220;
const SETTLE_MS = 1_200;
const TYPING_MS_PER_CHAR = 6;
const MIN_TYPING_MS = 250;
const MAX_TYPING_MS = 1_500;
/** Text past which a change shows at once: typing it would lay out the document every frame. */
const MAX_TYPED_CHARS = 2_000;
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
  animation: EditAnimation | null;
}

/** An agent's change as the editor shows it: its hunks, in `doc`, the document right after it. */
export interface PlayedEdit {
  agent: LiveAgent;
  hunks: EditHunk[];
  doc: Node;
}

type AgentEditsMeta = ({ type: "play" } & PlayedEdit) | { type: "frame" };

const agentEditsKey = new PluginKey<AgentEditsState>("agentEdits");

const EMPTY_STATE: AgentEditsState = { animation: null };

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

/** Where `before` and `after` differ: from `start`, up to `oldEnd` in `before` and `newEnd` in `after`. */
interface ChangedRegion {
  start: number;
  oldEnd: number;
  newEnd: number;
}

const changedRegion = (
  before: Fragment,
  after: Fragment
): ChangedRegion | null => {
  const start = before.findDiffStart(after);
  const end = before.findDiffEnd(after);
  if (start === null || end === null) {
    return null;
  }
  // Repeated content can make the end land before the start; both sides move back alike.
  const overlap = Math.max(0, start - Math.min(end.a, end.b));
  return { start, oldEnd: end.a + overlap, newEnd: end.b + overlap };
};

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
    typingMs:
      still || length > MAX_TYPED_CHARS
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

/** How long until `animation` next draws differently: 0 while its text is typed. */
const nextFrameIn = (animation: EditAnimation, now: number): number => {
  const typingFrom = animation.startedAt + animation.fadeMs;
  if (now < typingFrom) {
    return typingFrom - now;
  }
  if (now < typingFrom + animation.typingMs) {
    return 0;
  }
  return Math.max(1, endsAt(animation) - now);
};

type MapPosition = (position: number, assoc: -1 | 1) => number;

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

const applyAgentEdits = (
  transaction: Transaction,
  state: AgentEditsState,
  oldState: EditorState,
  newState: EditorState
): AgentEditsState => {
  const now = Date.now();
  const meta: AgentEditsMeta | undefined = transaction.getMeta(agentEditsKey);
  let { animation } = state;

  if (meta?.type === "play") {
    // Only while the hunks' positions are this document's: otherwise the change just shows.
    if (meta.doc === newState.doc) {
      // A new change replaces one still playing: its text is shown whole.
      animation = startAnimation(meta.agent, meta.hunks, now);
    }
  } else if (animation && transaction.docChanged) {
    const region = changedRegion(oldState.doc.content, newState.doc.content);
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
  return animation === state.animation ? state : { animation };
};

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

// Fades out on its own, in CSS: created once, never redrawn while it fades.
const removedWidget = (text: string) => () => {
  const removed = document.createElement("span");
  removed.setAttribute("aria-hidden", "true");
  removed.className =
    "animate-agent-edit-removed line-through decoration-2 text-muted-foreground";
  removed.textContent =
    text.length > LIVE_REMOVED_TEXT_MAX_CHARS
      ? `${text.slice(0, LIVE_REMOVED_TEXT_MAX_CHARS)}…`
      : text;
  return removed;
};

/** The frame of `animation` at `now`. */
function animationDecorations(
  doc: Node,
  animation: EditAnimation,
  now: number
): DecorationSet {
  const elapsedMs = now - animation.startedAt;
  const typedMs = Math.max(0, elapsedMs - animation.fadeMs);
  const typingDone = typedMs >= animation.typingMs;
  const total = textLength(animation.hunks);
  let budget =
    animation.typingMs === 0
      ? total
      : Math.round(total * Math.min(1, typedMs / animation.typingMs));
  const highlight = `color-mix(in srgb, ${animation.color} ${TYPING_HIGHLIGHT_PERCENT}%, transparent)`;
  // Unchanged from frame to frame, so the text keeps its DOM: once typed, the browser fades the
  // highlight in CSS.
  const shownAttrs = typingDone
    ? {
        class: "animate-agent-edit-settle",
        style: `--agent-edit-highlight: ${highlight}; border-radius: 2px`,
      }
    : { style: `background-color: ${highlight}; border-radius: 2px` };

  const decorations: Decoration[] = [];
  let caretAt: number | null = null;
  animation.hunks.forEach((hunk, index) => {
    if (elapsedMs < animation.fadeMs && hunk.removed !== "") {
      decorations.push(
        Decoration.widget(hunk.at, removedWidget(hunk.removed), {
          side: -1,
          // Stable across the frames of this playback, new for the next one at the same place.
          key: `agent-removed-${animation.startedAt}-${index}`,
        })
      );
    }
    for (const range of hunk.inserted) {
      const shown = Math.min(rangeLength(range), budget);
      budget -= shown;
      if (shown > 0) {
        decorations.push(
          Decoration.inline(range.from, range.from + shown, shownAttrs, {
            agentEdit: typingDone ? "settling" : "shown",
          })
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

  if (!typingDone && caretAt !== null && elapsedMs >= animation.fadeMs) {
    decorations.push(
      Decoration.widget(caretAt, caretWidget(animation), {
        side: -1,
        key: `agent-caret-${animation.agent.agentId}`,
      })
    );
  }
  return DecorationSet.create(doc, decorations);
}

/** A transaction playing back `edit`, whose hunks are in the document it applies to. */
export const withPlayedEdit = (
  state: EditorState,
  edit: PlayedEdit
): Transaction => {
  const meta: AgentEditsMeta = { type: "play", ...edit };
  return state.tr.setMeta(agentEditsKey, meta);
};

/**
 * @cc [owner:PopDaph,label:product;performance] live-agent-edit-playback
 * An edit given by `withPlayedEdit`, while its hunks are in the current document, MUST be played
 * back as that agent's: its removed text, up to
 * `LIVE_REMOVED_TEXT_MAX_CHARS` characters, fading where it stood, then its new text revealed in
 * document order behind a caret labelled with the agent's name, then highlighted until it settles.
 * Playback MUST only add decorations, never change the document, the selection or undo history,
 * and MUST follow later changes of the document, ending at once, its new text all shown, when a
 * later change touches that text; it MAY also end so when one change surrounds that text. With reduced
 * motion, or more than `MAX_TYPED_CHARS` of new text, the new text MUST show at once, highlighted
 * until it settles. The fading of removed text and of the highlight MUST run in CSS, with
 * decorations unchanged while they run: only typing MAY draw a new frame per display frame.
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
    // Frames are transactions that change nothing but the time the decorations are drawn at: one per
    // display frame while the text is typed, otherwise one when the next phase starts.
    view: (view) => {
      let pending: { animation: EditAnimation; cancel: () => void } | null =
        null;
      const frame = () => {
        pending = null;
        if (!view.isDestroyed) {
          const meta: AgentEditsMeta = { type: "frame" };
          view.dispatch(view.state.tr.setMeta(agentEditsKey, meta));
        }
      };
      const schedule = () => {
        const animation = agentEditsKey.getState(view.state)?.animation ?? null;
        if (pending?.animation === animation) {
          return;
        }
        pending?.cancel();
        pending = null;
        if (!animation) {
          return;
        }
        const delay = nextFrameIn(animation, Date.now());
        if (delay === 0) {
          const id = requestAnimationFrame(frame);
          pending = { animation, cancel: () => cancelAnimationFrame(id) };
        } else {
          const id = setTimeout(frame, delay);
          pending = { animation, cancel: () => clearTimeout(id) };
        }
      };
      schedule();
      return {
        update: schedule,
        destroy: () => pending?.cancel(),
      };
    },
  });
