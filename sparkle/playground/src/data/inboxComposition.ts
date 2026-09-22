import type { ConversationWorkState } from "./types";

/**
 * What an Inbox holds when you open it on an ordinary morning: a couple of
 * agents still at work, a handful of answers waiting to be read, a few
 * requests, and a long tail of things already dealt with.
 */
export const INBOX_COMPOSITION = {
  thinking: { min: 2, max: 3 },
  /** Rarer than the rest: an agent stops to ask only now and then. */
  pending: { min: 1, max: 2 },
  unread: { min: 4, max: 12 },
  requests: { min: 2, max: 6 },
  /**
   * Work you run with an agent is one answer waiting, which the dot says by
   * itself. Only a thread or two in an Inbox is a back-and-forth you let pile
   * up, and those are the only rows that count out loud.
   */
  multiMessage: { min: 1, max: 2 },
} as const;

/**
 * How far down the list work can still be moving. An agent works on what you
 * started recently, so a week-old row is finished one way or another.
 */
const IN_FLIGHT_DEPTH = 8;

/**
 * How far down an agent at work can be. Watching one work is the whole point
 * of the page, so it is never something you have to scroll for.
 */
const WORKING_RANK_MAX = 5;

/** How much of the unread pile sits up top rather than deeper in the week. */
const UNREAD_NEAR_TOP_SHARE = 0.65;

/**
 * The most of the list that can be asking for something. An Inbox is mostly
 * things you have dealt with, so a short week gets fewer unread rows rather
 * than a page where everything is shouting.
 */
const ACTIVE_SHARE_MAX = 0.4;

/** How long an agent works before coming back with an answer. */
const THINKING_MIN_MS = 60_000;
const THINKING_MAX_MS = 180_000;

/** The most a thread that did pile up has waiting in it. */
const MULTI_MESSAGE_COUNT_MAX = 4;

/**
 * A different Inbox on every visit, and the same one for as long as you stay:
 * the draw is seeded once, and the plan is otherwise a function of the rows
 * handed to it.
 */
const SESSION_SEED = Math.floor(Math.random() * 2 ** 32);

/** A row the plan can reach, in the order the Inbox lists them. */
export interface PlannableRow {
  id: string;
  kind: "conversation" | "request";
  /**
   * A state the row already has, which the plan takes as given and counts
   * against its targets. A conversation whose thread is written out states its
   * own case, and so does a row the last plan has already settled: replanning
   * a list someone is looking at must not move the rows they have not touched.
   */
  fixedState?: ConversationWorkState;
  fixedUnreadCount?: number;
}

export interface InboxComposition {
  /** Where a row stands; a row the map does not mention has been read. */
  states: Map<string, ConversationWorkState>;
  /** What a row counts once it is unread, drawn along with the state. */
  unreadCounts: Map<string, number>;
  /** The requests recent enough to be Inbox business rather than queue business. */
  visibleRequestIds: Set<string>;
}

/** Mulberry32: small, seedable, and good enough to lay out a fake Inbox. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(
  random: () => number,
  { min, max }: { min: number; max: number }
): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** A number from a row's id, so a row keeps its own timing between renders. */
function hashRowId(rowId: string): number {
  let hash = 0;
  for (let index = 0; index < rowId.length; index++) {
    hash = (Math.imul(hash, 31) + rowId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/**
 * How long this row's agent works before it has an answer. Each row gets its
 * own stretch of a minute to three, so an Inbox left open settles one row at a
 * time rather than all at once.
 */
export function getThinkingDurationMs(rowId: string): number {
  return (
    THINKING_MIN_MS + (hashRowId(rowId) % (THINKING_MAX_MS - THINKING_MIN_MS))
  );
}

/**
 * How much a thread that piled up has waiting in it — two at least, since one
 * is what every other row has. It comes off the row's own id rather than the
 * draw, so replanning a list hands the row back the number it already had
 * instead of dealing from the top of the deck again.
 */
function getMultiMessageCount(rowId: string): number {
  return (
    2 + (hashRowId(`${rowId}:${SESSION_SEED}`) % (MULTI_MESSAGE_COUNT_MAX - 1))
  );
}

/**
 * Lay out a believable Inbox over the rows it actually lists. The states are
 * planned here rather than drawn with each conversation because what you can
 * see depends on which pods you are in: only the list knows how much is left
 * once that is settled, and so only the list can promise you two agents at
 * work and a handful of unread rows.
 */
export function planInboxComposition(
  rows: PlannableRow[],
  /** The requests the Inbox is already showing, which it goes on showing. */
  keepRequestIds?: Set<string>
): InboxComposition {
  const random = createRandom(SESSION_SEED);
  const states = new Map<string, ConversationWorkState>();
  const unreadCounts = new Map<string, number>();

  const conversations = rows.filter((row) => row.kind === "conversation");
  const available = new Set(
    conversations.filter((row) => !row.fixedState).map((row) => row.id)
  );

  const countOf = (state: ConversationWorkState) =>
    [...states.values()].filter((value) => value === state).length;

  const assign = (ids: string[], state: ConversationWorkState) => {
    for (const id of ids) {
      states.set(id, state);
      // One message waiting, until the pass below hands a thread or two more
      // than that. A working row is counted too: it will have something to
      // show the moment its agent is done, and it comes back unread.
      if (state !== "pending") {
        unreadCounts.set(id, 1);
      }
    }
  };

  const draw = (candidates: string[], count: number): string[] => {
    const pool = candidates.filter((id) => available.has(id));
    const picked: string[] = [];
    while (picked.length < count && pool.length > 0) {
      const [id] = pool.splice(Math.floor(random() * pool.length), 1);
      available.delete(id);
      picked.push(id);
    }
    return picked;
  };

  const target = (
    range: { min: number; max: number },
    state: ConversationWorkState
  ) => Math.max(0, between(random, range) - countOf(state));

  // Which requests the Inbox keeps is settled first, because it decides what
  // the top of the list is made of.
  const requestIds = rows
    .filter((row) => row.kind === "request")
    .map((row) => row.id);
  const shownRequests = requestIds.filter((id) => keepRequestIds?.has(id));
  const requestTarget = Math.max(
    shownRequests.length,
    between(random, INBOX_COMPOSITION.requests)
  );
  const visibleRequestIds = new Set([
    ...shownRequests,
    ...requestIds
      .filter((id) => !keepRequestIds?.has(id))
      .slice(0, requestTarget - shownRequests.length),
  ]);
  const listed = rows.filter(
    (row) => row.kind === "conversation" || visibleRequestIds.has(row.id)
  );

  const ids = conversations.map((row) => row.id);
  const top = ids.slice(0, IN_FLIGHT_DEPTH);
  // An agent at work is the first thing the Inbox has to say, so it works
  // where you can see it without scrolling — counted over the list as it is
  // listed, requests and all, not over the conversations alone.
  const working = new Set(
    listed
      .slice(0, WORKING_RANK_MAX)
      .filter((row) => row.kind === "conversation")
      .map((row) => row.id)
  );

  // A row that states its own case is counted, not overruled — except for one
  // that says it is working from further down the list than work is allowed
  // to be. That happens when rows arrive after the first plan and push it
  // down, and an agent that has been overtaken is an agent that is done.
  for (const row of conversations) {
    if (!row.fixedState) {
      continue;
    }
    const state =
      row.fixedState === "thinking" && !working.has(row.id)
        ? "unread"
        : row.fixedState;
    states.set(row.id, state);
    if (state !== "pending") {
      unreadCounts.set(row.id, row.fixedUnreadCount ?? 1);
    }
  }

  assign(
    draw([...working], target(INBOX_COMPOSITION.thinking, "thinking")),
    "thinking"
  );
  assign(draw(top, target(INBOX_COMPOSITION.pending, "pending")), "pending");

  const unreadTarget = Math.min(
    target(INBOX_COMPOSITION.unread, "unread"),
    Math.max(0, Math.floor(ids.length * ACTIVE_SHARE_MAX) - states.size)
  );
  const recentDepth = Math.max(IN_FLIGHT_DEPTH, Math.ceil(ids.length / 3));
  const nearTop = Math.round(unreadTarget * UNREAD_NEAR_TOP_SHARE);
  const unread = [
    ...draw(ids.slice(0, recentDepth), nearTop),
    ...draw(ids.slice(recentDepth), unreadTarget - nearTop),
  ];
  // Whatever one end of the week could not supply comes from the other, so the
  // Inbox still holds as many unread rows as it set out to.
  assign([...unread, ...draw(ids, unreadTarget - unread.length)], "unread");

  // Which threads piled up, now that there is a list of rows to pick them
  // from. Rows already carrying a number keep it and count against the
  // target, and the rest are taken in hash order so a replan picks the same
  // ones again.
  const pileTarget = Math.max(
    0,
    between(random, INBOX_COMPOSITION.multiMessage) -
      [...unreadCounts.values()].filter((count) => count > 1).length
  );
  const piled = [...unreadCounts.keys()]
    // A thread only piles up once it has been answered and left: an agent
    // still working has nothing waiting, and a spinner has nowhere to put a
    // number anyway.
    .filter((id) => unreadCounts.get(id) === 1 && states.get(id) === "unread")
    .sort((a, b) => hashRowId(a) - hashRowId(b))
    .slice(0, pileTarget);
  for (const id of piled) {
    unreadCounts.set(id, getMultiMessageCount(id));
  }

  return { states, unreadCounts, visibleRequestIds };
}
