import type { DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import { dfmCommentsSchema } from "@app/lib/markdown/dfm";
import { cn } from "@dust-tt/sparkle";
import type { Editor, JSONContent } from "@tiptap/core";
import { Extension, isMacOS, Mark } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Fragment, Mark as ProseMirrorMark, Slice } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { AddMarkStep, RemoveMarkStep } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { z } from "zod";

export const COMMENT_MARK_NAME = "comment";
const COMMENTS_ATTRIBUTE = "comments";
const REMOVED_COMMENT_MARKS_META = "removedCommentMarks";

const HIGHLIGHT_CLASS = cn(
  "cursor-pointer rounded-sm bg-golden-100 transition-colors",
  "hover:bg-golden-200/70 dark:bg-golden-400/20 dark:hover:bg-golden-400/30",
  "motion-reduce:transition-none print:bg-transparent"
);
// Dark alphas keep stone-200 text above 4.5:1 on the composited highlight.
const ACTIVE_HIGHLIGHT_CLASS = cn(
  "bg-golden-200 hover:bg-golden-200",
  "dark:bg-golden-400/40 dark:hover:bg-golden-400/40"
);

export interface DocumentCommentDraft {
  from: number;
  to: number;
}

interface DocumentCommentsState {
  activeId: string | null;
  draft: DocumentCommentDraft | null;
  decorations: DecorationSet;
}

type DocumentCommentsMeta =
  | { type: "draft"; from: number; to: number }
  | { type: "cancelDraft" }
  | { type: "commit"; id: string }
  | { type: "active"; id: string | null };

export const documentCommentsPluginKey = new PluginKey<DocumentCommentsState>(
  "documentComments"
);

// The attribute validates against the same schema, so parsing cannot fail on a live document.
// ProseMirror keeps an attribute's value until a transaction sets a new one, so each version
// of the threads is parsed once, however many cursor moves and edits read it.
const parsedThreads = new WeakMap<object, DfmComment[]>();

const parseThreads = (value: unknown): DfmComment[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value !== "object") {
    return dfmCommentsSchema.parse(value);
  }
  const cached = parsedThreads.get(value);
  if (cached) {
    return cached;
  }
  const parsed = dfmCommentsSchema.parse(value);
  parsedThreads.set(value, parsed);
  return parsed;
};

export const getDocumentComments = (doc: Node): DfmComment[] =>
  parseThreads(doc.attrs[COMMENTS_ATTRIBUTE]);

/** The threads a document JSON carries, as getJSON returns them. */
export const getDocumentJSONComments = (document: JSONContent): DfmComment[] =>
  parseThreads(document.attrs?.[COMMENTS_ATTRIBUTE]);

export const withDocumentJSONComments = (
  document: JSONContent,
  comments: DfmComment[]
): JSONContent => ({
  ...document,
  attrs: { ...document.attrs, [COMMENTS_ATTRIBUTE]: comments },
});

export const withoutDocumentJSONComments = ({
  attrs,
  ...document
}: JSONContent): JSONContent => {
  const { [COMMENTS_ATTRIBUTE]: _comments, ...rest } = attrs ?? {};
  return Object.keys(rest).length > 0 ? { ...document, attrs: rest } : document;
};

/** The document without the comment marks whose id is not in `threadIds`. */
export const withoutOrphanCommentMarks = (
  content: JSONContent,
  threadIds: Set<string>
): JSONContent => {
  const { marks, content: children, ...node } = content;
  const kept = marks?.filter(
    (mark) =>
      mark.type !== COMMENT_MARK_NAME || threadIds.has(String(mark.attrs?.id))
  );
  return {
    ...node,
    ...(kept && kept.length > 0 && { marks: kept }),
    ...(children && {
      content: children.map((child) =>
        withoutOrphanCommentMarks(child, threadIds)
      ),
    }),
  };
};

/** Comment ids of every highlight wrapping the clicked element. */
export const getClickedCommentIds = (
  target: EventTarget | null,
  root: Element
) => {
  const ids: string[] = [];
  let element = target instanceof Element ? target : null;

  while (element && element !== root) {
    const id = element.getAttribute("data-comment-highlight");
    if (id !== null) {
      ids.push(id);
    }
    element = element.parentElement;
  }

  return ids;
};

/** First rendered highlight of each unresolved comment, from one DOM pass. */
export const getCommentHighlights = (editor: Editor) => {
  const highlights = new Map<string, HTMLElement>();
  for (const element of editor.view.dom.querySelectorAll<HTMLElement>(
    "[data-comment-highlight]"
  )) {
    const id = element.dataset.commentHighlight;
    if (id !== undefined && !highlights.has(id)) {
      highlights.set(id, element);
    }
  }
  return highlights;
};

export const scrollToCommentHighlight = (editor: Editor, id: string) => {
  getCommentHighlights(editor)
    .get(id)
    ?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
};

/**
 * True when some text in the range can carry a comment mark, mirroring what addMark
 * would do. Code blocks declare `marks: ""` and the inline code mark excludes every other
 * mark, so a selection made only of those would save a thread with nothing to anchor it.
 */
const rangeAcceptsCommentMark = (doc: Node, from: number, to: number) => {
  const markType = doc.type.schema.marks[COMMENT_MARK_NAME];
  let accepts = false;
  doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (
      node.isText &&
      parent?.type.allowsMarkType(markType) &&
      !node.marks.some((mark) => mark.type.excludes(markType))
    ) {
      accepts = true;
    }
    return !accepts;
  });
  return accepts;
};

interface CommentRange {
  from: number;
  to: number;
}

const commentRanges = new WeakMap<Node, Map<string, CommentRange>>();

/** Each comment's first marked character to its last, in document order by the first. */
const getCommentRanges = (doc: Node): Map<string, CommentRange> => {
  const cached = commentRanges.get(doc);
  if (cached) {
    return cached;
  }
  const ranges = new Map<string, CommentRange>();

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }
    for (const mark of node.marks) {
      if (mark.type.name === COMMENT_MARK_NAME) {
        const range = ranges.get(mark.attrs.id);
        ranges.set(mark.attrs.id, {
          from: range?.from ?? pos,
          to: pos + node.nodeSize,
        });
      }
    }
  });

  commentRanges.set(doc, ranges);
  return ranges;
};

const commentStarts = new WeakMap<Node, Map<string, number>>();

/** Position of the first text each comment covers. */
export const getCommentStarts = (doc: Node): Map<string, number> => {
  const cached = commentStarts.get(doc);
  if (cached) {
    return cached;
  }
  const starts = new Map(
    [...getCommentRanges(doc)].map(([id, { from }]) => [id, from])
  );
  commentStarts.set(doc, starts);
  return starts;
};

const commentedTexts = new WeakMap<Node, Map<string, string>>();

/**
 * @cc [owner:tdraier,label:product] document-comment-quotes
 * A comment's quote MUST be all the text from its first marked character to its last, in
 * document order by first marked character, including text inside the range that cannot carry
 * the mark, such as inline code, with blocks separated by a space.
 */
/**
 * @cc [owner:tdraier,label:performance] document-comment-quotes-one-walk
 * All quotes MUST come from one walk of the document, so the work grows with the document plus
 * the quoted text, not with the document times the number of comments.
 */
export const getCommentedTexts = (doc: Node): Map<string, string> => {
  const cached = commentedTexts.get(doc);
  if (cached) {
    return cached;
  }
  const quotes = [...getCommentRanges(doc)].map(([id, range]) => ({
    id,
    ...range,
    text: "",
    started: false,
  }));
  let next = 0;
  let open: typeof quotes = [];

  // Builds what doc.textBetween(from, to, " ") returns for every comment at once.
  doc.descendants((node, pos) => {
    const end = pos + node.nodeSize;
    if (open.length > 0) {
      open = open.filter((quote) => quote.to > pos);
    }
    while (next < quotes.length && quotes[next].from < end) {
      open.push(quotes[next++]);
    }
    for (const quote of open) {
      const text = node.isText
        ? (node.text ?? "").slice(
            Math.max(quote.from, pos) - pos,
            quote.to - pos
          )
        : node.isLeaf
          ? (node.type.spec.leafText?.(node) ?? "")
          : "";
      if (node.isBlock && (node.isTextblock || (node.isLeaf && text))) {
        if (quote.started) {
          quote.text += " ";
        }
        quote.started = true;
      }
      quote.text += text;
    }
  });

  const texts = new Map(quotes.map(({ id, text }) => [id, text]));
  commentedTexts.set(doc, texts);
  return texts;
};

const commentsById = (doc: Node) =>
  new Map(getDocumentComments(doc).map((comment) => [comment.id, comment]));

const highlightsBetween = (
  doc: Node,
  from: number,
  to: number,
  comments: Map<string, DfmComment>,
  activeId: string | null
) => {
  const decorations: Decoration[] = [];

  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) {
      return;
    }

    for (const mark of node.marks) {
      if (mark.type.name !== COMMENT_MARK_NAME) {
        continue;
      }

      const comment = comments.get(mark.attrs.id);
      if (
        !comment ||
        (comment.status === "resolved" && comment.id !== activeId)
      ) {
        continue;
      }

      // nodeName gives each comment its own wrapper. ProseMirror otherwise merges
      // same-range decorations into one span and keeps a single id.
      decorations.push(
        Decoration.inline(pos, pos + node.nodeSize, {
          nodeName: "span",
          class: cn(
            HIGHLIGHT_CLASS,
            comment.id === activeId && ACTIVE_HIGHLIGHT_CLASS
          ),
          "data-comment-highlight": comment.id,
        })
      );
    }
  });

  return decorations;
};

const DRAFT_SPEC = { draft: true };

const buildDecorations = (
  doc: Node,
  activeId: string | null,
  draft: DocumentCommentDraft | null
) =>
  DecorationSet.create(doc, [
    ...highlightsBetween(doc, 0, doc.content.size, commentsById(doc), activeId),
    ...(draft
      ? [
          Decoration.inline(
            draft.from,
            draft.to,
            {
              nodeName: "span",
              class: cn(HIGHLIGHT_CLASS, ACTIVE_HIGHLIGHT_CLASS),
              "data-comment-draft": "",
            },
            DRAFT_SPEC
          ),
        ]
      : []),
  ]);

/** Where the transactions changed content or marks, in the last one's document. */
const changedRanges = (transactions: readonly Transaction[]) => {
  let ranges: CommentRange[] = [];
  for (const transaction of transactions) {
    for (const step of transaction.steps) {
      const map = step.getMap();
      ranges = ranges.map(({ from, to }) => ({
        from: map.map(from, -1),
        to: map.map(to, 1),
      }));
      if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
        ranges.push({ from: step.from, to: step.to });
      }
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        ranges.push({ from: newStart, to: newEnd });
      });
    }
  }
  return ranges;
};

/** The range widened to the whole textblocks it touches. */
const toTextblocks = (doc: Node, { from, to }: CommentRange): CommentRange => {
  let start = from;
  let end = to;
  doc.nodesBetween(
    Math.max(0, from - 1),
    Math.min(doc.content.size, to + 1),
    (node, pos) => {
      if (node.isTextblock) {
        start = Math.min(start, pos);
        end = Math.max(end, pos + node.nodeSize);
        return false;
      }
      return true;
    }
  );
  return { from: start, to: end };
};

/**
 * @cc [owner:tdraier,label:performance] document-comment-highlights-local
 * Unless a comments command runs or the threads or the active comment change, a transaction
 * MUST only rebuild the comment highlights of the textblocks it changes, content or marks, and
 * map the others and the draft highlight.
 */
const updateDecorations = (
  previous: DecorationSet,
  transaction: Transaction,
  activeId: string | null
) => {
  const { doc } = transaction;
  const comments = commentsById(doc);
  let decorations = previous.map(transaction.mapping, doc);
  for (const changed of changedRanges([transaction])) {
    const { from, to } = toTextblocks(doc, changed);
    decorations = decorations
      .remove(decorations.find(from, to, (spec) => spec !== DRAFT_SPEC))
      .add(doc, highlightsBetween(doc, from, to, comments, activeId));
  }
  return decorations;
};

const updateComment = (
  comments: DfmComment[],
  id: string,
  update: (comment: DfmComment) => DfmComment
) => comments.map((comment) => (comment.id === id ? update(comment) : comment));

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentComments: {
      /** Marks the current text selection as the range of a comment being written. */
      startCommentDraft: () => ReturnType;
      cancelCommentDraft: () => ReturnType;
      /** Attaches the comment to the draft range and makes it the active comment. */
      addComment: (comment: DfmComment) => ReturnType;
      replyToComment: (id: string, message: DfmMessage) => ReturnType;
      setCommentResolved: (id: string, resolved: boolean) => ReturnType;
      /** Removes the comment and every mark that anchors it. */
      deleteComment: (id: string) => ReturnType;
      /** Removes every mark that anchors the comment, keeping its thread. */
      removeCommentMarks: (id: string) => ReturnType;
      /** Replaces every thread, keeping the marks; a live document gets its threads this way. */
      setCommentThreads: (comments: DfmComment[]) => ReturnType;
      /** Replaces the commented text with inline content that keeps the comment. */
      applyCommentSuggestion: (
        id: string,
        content: JSONContent[]
      ) => ReturnType;
      setActiveComment: (id: string | null) => ReturnType;
    };
  }
}

/**
 * @cc [owner:flvndvd;tdraier,label:product] document-comment-anchor
 * Comment marks MUST store only the comment id. Marks MUST NOT extend to text typed at
 * their edges. Distinct comments MUST be allowed on overlapping text.
 */
/**
 * @cc [owner:tdraier,label:product] document-comment-not-pasted
 * Comment marks MUST come only from the file's anchors and the comment commands, never from
 * parsed HTML, pasted content or a copy dropped from a drag, so a copy cannot widen a comment
 * to everything between it and its source or anchor one that has no thread. Text moved by a
 * drag MUST keep the marks of the comments it moves whole and lose the others, so a comment is
 * never split in two.
 */
const withoutCommentMarks = (
  fragment: Fragment,
  kept: Set<string>
): Fragment => {
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    nodes.push(
      node.isText
        ? node.mark(
            node.marks.filter(
              (mark) =>
                mark.type.name !== COMMENT_MARK_NAME || kept.has(mark.attrs.id)
            )
          )
        : node.copy(withoutCommentMarks(node.content, kept))
    );
  });
  return Fragment.fromArray(nodes);
};

/** Comments whose whole text lies in the selection being dragged. */
const commentsMovedWhole = (view: EditorView) => {
  const { from, to } = view.state.selection;
  const ids = new Set<string>();
  for (const [id, range] of getCommentRanges(view.state.doc)) {
    if (range.from >= from && range.to <= to) {
      ids.add(id);
    }
  }
  return ids;
};

const canCarryCommentMark = (node: Node, parent: Node | null) => {
  const markType = node.type.schema.marks[COMMENT_MARK_NAME];
  return (
    node.isText &&
    !!parent?.type.allowsMarkType(markType) &&
    !node.marks.some((mark) => mark.type.excludes(markType))
  );
};

/** The text between `from` and `to` as inline nodes without comment marks, or null unless one textblock holds it. */
const inlineContentBetween = (
  doc: Node,
  from: number,
  to: number
): JSONContent[] | null => {
  const $from = doc.resolve(from);
  if (!$from.parent.isTextblock || !$from.sameParent(doc.resolve(to))) {
    return null;
  }
  const start = $from.start();
  return (
    withoutCommentMarks(
      $from.parent.content.cut(from - start, to - start),
      new Set()
    ).toJSON() ?? []
  );
};

/** The commented text as inline nodes, or null when the comment has no text or spans textblocks. */
export const getCommentInlineContent = (
  doc: Node,
  id: string
): JSONContent[] | null => {
  const range = getCommentRanges(doc).get(id);
  return range ? inlineContentBetween(doc, range.from, range.to) : null;
};

/** The draft's text from the first character a comment mark can sit on to the last, the text its comment would anchor. */
export const getDraftInlineContent = (
  doc: Node,
  draft: DocumentCommentDraft
): JSONContent[] | null => {
  let from: number | null = null;
  let to: number | null = null;
  doc.nodesBetween(draft.from, draft.to, (node, pos, parent) => {
    if (canCarryCommentMark(node, parent)) {
      from ??= Math.max(pos, draft.from);
      to = Math.min(pos + node.nodeSize, draft.to);
    }
  });
  return from !== null && to !== null
    ? inlineContentBetween(doc, from, to)
    : null;
};

const suggestableComments = new WeakMap<Node, Set<string>>();

/** Comments whose text lies in one textblock, the ones a suggestion can replace. */
export const getSuggestableCommentIds = (doc: Node): Set<string> => {
  const cached = suggestableComments.get(doc);
  if (cached) {
    return cached;
  }
  const ids = new Set<string>();
  for (const [id, { from, to }] of getCommentRanges(doc)) {
    if (doc.resolve(from).sameParent(doc.resolve(to))) {
      ids.add(id);
    }
  }
  suggestableComments.set(doc, ids);
  return ids;
};

/**
 * @cc [owner:tdraier,label:product] document-comment-inherited
 * Text inserted between a comment's first and last marked characters MUST take that comment's
 * mark wherever the mark can sit, so a comment stays one run and saving never fails on a gap.
 * Text inserted at a comment's edges MUST NOT take it.
 */
const inheritEnclosingComments = (
  tr: Transaction,
  inserted: CommentRange[]
) => {
  const { doc } = tr;
  const markType = doc.type.schema.marks[COMMENT_MARK_NAME];
  for (const [id, comment] of getCommentRanges(doc)) {
    const mark = markType.create({ id });
    for (const range of inserted) {
      const from = Math.max(range.from, comment.from);
      const to = Math.min(range.to, comment.to);
      if (from >= to) {
        continue;
      }
      doc.nodesBetween(from, to, (node, pos, parent) => {
        if (canCarryCommentMark(node, parent) && !mark.isInSet(node.marks)) {
          tr.addMark(
            Math.max(pos, from),
            Math.min(pos + node.nodeSize, to),
            mark
          );
        }
      });
    }
  }
};

/**
 * @cc [owner:tdraier,label:product] document-comment-orphan-marks-dropped
 * When a transaction puts the mark of a comment without a thread on text, such as an undo
 * restoring text after its comment was deleted, that mark MUST be removed from the whole
 * document, since saving fails on an anchor without a thread. A live document, configured with
 * `holdsThreads: false`, MUST keep such marks: its editor does not hold the threads, and a
 * removal would spread to every other editor.
 */
const dropOrphanCommentMarks = (tr: Transaction, changed: CommentRange[]) => {
  const threads = new Set(
    getDocumentComments(tr.doc).map((comment) => comment.id)
  );
  const orphans = new Set<string>();
  for (const { from, to } of changed) {
    tr.doc.nodesBetween(from, to, (node) => {
      for (const mark of node.marks) {
        if (
          mark.type.name === COMMENT_MARK_NAME &&
          !threads.has(mark.attrs.id)
        ) {
          orphans.add(mark.attrs.id);
        }
      }
    });
  }
  const markType = tr.doc.type.schema.marks[COMMENT_MARK_NAME];
  for (const id of orphans) {
    tr.removeMark(0, tr.doc.content.size, markType.create({ id }));
  }
};

/**
 * @cc [owner:tdraier,label:product] document-comment-edges-kept
 * A transaction MUST be refused when it takes the comment mark off the first or last character
 * of a comment that has a thread after it, without deleting that character, such as inline code
 * or a code block over a comment's edge, since saving would then shrink or drop the comment.
 * With `holdsThreads: false`, every marked comment counts as having a thread, except the one
 * whose marks `removeCommentMarks` strips.
 */
const takesCommentEdge = (
  transaction: Transaction,
  before: EditorState,
  holdsThreads: boolean
) => {
  if (
    !transaction.steps.some(
      (step) =>
        step instanceof RemoveMarkStep &&
        step.mark.type.name === COMMENT_MARK_NAME
    )
  ) {
    return false;
  }
  const after = getCommentRanges(transaction.doc);
  const threadsAfter = new Set(
    getDocumentComments(transaction.doc).map((comment) => comment.id)
  );
  const removed = transaction.getMeta(REMOVED_COMMENT_MARKS_META);
  for (const [id, { from, to }] of getCommentRanges(before.doc)) {
    if (id === removed || (holdsThreads && !threadsAfter.has(id))) {
      continue;
    }
    const range = after.get(id);
    const start = transaction.mapping.mapResult(from, 1);
    const end = transaction.mapping.mapResult(to, -1);
    if (
      (!start.deletedAfter && !(range && range.from <= start.pos)) ||
      (!end.deletedBefore && !(range && range.to >= end.pos))
    ) {
      return true;
    }
  }
  return false;
};

export const DocumentCommentMark = Mark.create<{ holdsThreads: boolean }>({
  name: COMMENT_MARK_NAME,
  addOptions: () => ({ holdsThreads: true }),
  inclusive: false,
  excludes: "",
  addAttributes: () => ({
    id: {
      default: null,
      validate: (value: unknown) => {
        z.string().min(1).parse(value);
      },
      renderHTML: (attributes) => ({ "data-comment-id": attributes.id }),
    },
  }),
  parseHTML: () => [],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
  addProseMirrorPlugins() {
    const { holdsThreads } = this.options;
    // ProseMirror runs transformPasted before deciding whether a drop moves or copies; the drop
    // event arrives first. Asking the dragCopies props, this one included, gives ProseMirror's
    // own answer.
    let dropCopies = false;
    return [
      new Plugin({
        props: {
          dragCopies: (event) => event[isMacOS() ? "altKey" : "ctrlKey"],
          handleDOMEvents: {
            drop: (view, event) => {
              dropCopies = !!view.someProp("dragCopies", (copies) =>
                copies(event)
              );
              return false;
            },
          },
          transformPasted: (slice, view) =>
            new Slice(
              withoutCommentMarks(
                slice.content,
                view.dragging && !dropCopies
                  ? commentsMovedWhole(view)
                  : new Set()
              ),
              slice.openStart,
              slice.openEnd
            ),
        },
        filterTransaction: (transaction, state) =>
          !takesCommentEdge(transaction, state, holdsThreads),
        appendTransaction: (transactions, _oldState, newState) => {
          const changed = changedRanges(transactions);
          if (changed.length === 0) {
            return null;
          }
          const tr = newState.tr;
          if (holdsThreads) {
            dropOrphanCommentMarks(tr, changed);
          }
          // Without the threads, marks are the only sign of a comment.
          if (!holdsThreads || getDocumentComments(tr.doc).length > 0) {
            inheritEnclosingComments(tr, changed);
          }
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});

/**
 * @cc [owner:tdraier,label:product] document-comments-in-doc
 * While the document is open, comment threads MUST live in the document's `comments`
 * attribute as DFM threads and anchor to text through comment marks, so dirty tracking and
 * autosave cover comment changes. Deleting a comment MUST remove its marks; in a live document,
 * whose threads the session sends, the editor deleting it MUST remove them through the shared
 * document, and replacing the threads MUST NOT. Resolving MUST keep them so the thread can be
 * reopened in place.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-highlights
 * Open comments MUST render as highlights over their marked text. Resolved comments, unless
 * active, and comments without a thread MUST render as plain text. The active comment, resolved
 * or not, and a pending draft MUST render with the emphasized highlight, so selecting a resolved
 * thread still shows its text.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:product] document-comment-draft-range
 * A draft MUST start only when some selected text can carry a comment mark, and its submission
 * MUST be refused once no text in its range can, so every submitted thread has an anchor. A
 * pending draft range MUST follow document edits around it without growing from text inserted
 * at its edges. A draft whose range collapses MUST be dropped. Starting a draft MUST collapse
 * the selection to the end of the range.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:product] document-comment-history
 * Posting, replying to, resolving and deleting comments MUST stay out of text undo history.
 * Undoing text MUST NOT restore an old comments array or remove another user's replies.
 */
/**
 * @cc [owner:tdraier,label:product] document-comment-suggestion-apply
 * Applying a suggestion MUST replace exactly the text from the comment's first marked character
 * to its last with the given inline content, which MUST carry the comment's mark wherever the
 * mark can sit, in one text edit that undo reverts. The content MUST also carry the mark of
 * every other comment with a thread whose text encloses the replaced text, so that comment stays
 * one run. It MUST be refused, leaving the document unchanged, when the comment has no thread or
 * no text, when its text spans more than one textblock, when the content cannot sit in that
 * textblock, or when it would remove text of another comment with a thread that does not
 * enclose the replaced text, or all the text of one that does.
 */
export const DocumentComments = Extension.create({
  name: "documentComments",
  addGlobalAttributes: () => [
    {
      types: ["doc"],
      attributes: {
        [COMMENTS_ATTRIBUTE]: {
          default: [],
          rendered: false,
          validate: (value: unknown) => {
            dfmCommentsSchema.parse(value);
          },
        },
      },
    },
  ],
  addCommands: () => ({
    startCommentDraft:
      () =>
      ({ state, tr, dispatch }) => {
        const { selection } = state;
        if (
          !(selection instanceof TextSelection) ||
          selection.empty ||
          !rangeAcceptsCommentMark(state.doc, selection.from, selection.to)
        ) {
          return false;
        }

        if (dispatch) {
          // The draft highlight now marks the range. Collapsing the selection also lets
          // the selection toolbar notice the draft and hide.
          tr.setSelection(TextSelection.create(tr.doc, selection.to));
          tr.setMeta(documentCommentsPluginKey, {
            type: "draft",
            from: selection.from,
            to: selection.to,
          } satisfies DocumentCommentsMeta);
        }
        return true;
      },
    cancelCommentDraft:
      () =>
      ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta(documentCommentsPluginKey, {
            type: "cancelDraft",
          } satisfies DocumentCommentsMeta);
        }
        return true;
      },
    addComment:
      (comment) =>
      ({ state, tr, dispatch }) => {
        const draft = documentCommentsPluginKey.getState(state)?.draft;
        if (
          !draft ||
          !rangeAcceptsCommentMark(state.doc, draft.from, draft.to)
        ) {
          return false;
        }

        if (dispatch) {
          tr.addMark(
            draft.from,
            draft.to,
            state.schema.marks[COMMENT_MARK_NAME].create({ id: comment.id })
          );
          // A live document may already hold the thread, pushed by the session.
          tr.setDocAttribute(COMMENTS_ATTRIBUTE, [
            ...getDocumentComments(state.doc).filter(
              ({ id }) => id !== comment.id
            ),
            comment,
          ]);
          tr.setMeta(documentCommentsPluginKey, {
            type: "commit",
            id: comment.id,
          } satisfies DocumentCommentsMeta);
          tr.setMeta("addToHistory", false);
        }
        return true;
      },
    replyToComment:
      (id, message) =>
      ({ state, tr, dispatch }) => {
        const comments = getDocumentComments(state.doc);
        if (!comments.some((comment) => comment.id === id)) {
          return false;
        }

        if (dispatch) {
          tr.setDocAttribute(
            COMMENTS_ATTRIBUTE,
            updateComment(comments, id, (comment) => ({
              ...comment,
              messages: [...comment.messages, message],
            }))
          );
          tr.setMeta("addToHistory", false);
        }
        return true;
      },
    setCommentResolved:
      (id, resolved) =>
      ({ state, tr, dispatch }) => {
        const comments = getDocumentComments(state.doc);
        if (!comments.some((comment) => comment.id === id)) {
          return false;
        }

        if (dispatch) {
          tr.setDocAttribute(
            COMMENTS_ATTRIBUTE,
            updateComment(comments, id, (comment) => ({
              ...comment,
              status: resolved ? "resolved" : "open",
            }))
          );
          tr.setMeta("addToHistory", false);
        }
        return true;
      },
    deleteComment:
      (id) =>
      ({ state, tr, dispatch }) => {
        const comments = getDocumentComments(state.doc);
        if (!comments.some((comment) => comment.id === id)) {
          return false;
        }

        if (dispatch) {
          // With a mark instance, removeMark strips only marks equal to it.
          tr.removeMark(
            0,
            state.doc.content.size,
            state.schema.marks[COMMENT_MARK_NAME].create({ id })
          );
          tr.setDocAttribute(
            COMMENTS_ATTRIBUTE,
            comments.filter((comment) => comment.id !== id)
          );
          tr.setMeta("addToHistory", false);
        }
        return true;
      },
    removeCommentMarks:
      (id) =>
      ({ state, tr, dispatch }) => {
        if (dispatch) {
          tr.removeMark(
            0,
            state.doc.content.size,
            state.schema.marks[COMMENT_MARK_NAME].create({ id })
          );
          tr.setMeta(REMOVED_COMMENT_MARKS_META, id);
          tr.setMeta("addToHistory", false);
        }
        return true;
      },
    setCommentThreads:
      (comments) =>
      ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setDocAttribute(COMMENTS_ATTRIBUTE, comments);
          tr.setMeta("addToHistory", false);
        }
        return true;
      },
    applyCommentSuggestion:
      (id, content) =>
      ({ state, tr, dispatch }) => {
        const ranges = getCommentRanges(state.doc);
        const range = ranges.get(id);
        const threads = new Set(
          getDocumentComments(state.doc).map((comment) => comment.id)
        );
        if (!range || !threads.has(id)) {
          return false;
        }
        const $from = state.doc.resolve(range.from);
        const $to = state.doc.resolve(range.to);
        if (!$from.parent.isTextblock || !$from.sameParent($to)) {
          return false;
        }

        const markType = state.schema.marks[COMMENT_MARK_NAME];
        const marks = [markType.create({ id })];
        const sameRange: string[] = [];
        for (const [otherId, other] of ranges) {
          if (
            otherId === id ||
            !threads.has(otherId) ||
            other.to <= range.from ||
            other.from >= range.to
          ) {
            continue;
          }
          if (other.from > range.from || other.to < range.to) {
            return false;
          }
          marks.push(markType.create({ id: otherId }));
          if (other.from === range.from && other.to === range.to) {
            sameRange.push(otherId);
          }
        }

        let replacement: Fragment;
        try {
          replacement = Fragment.fromArray(
            content.map((json) => {
              const node = state.schema.nodeFromJSON(json);
              return canCarryCommentMark(node, $from.parent)
                ? node.mark(
                    ProseMirrorMark.setFrom([
                      ...node.marks.filter((mark) => mark.type !== markType),
                      ...marks,
                    ])
                  )
                : node;
            })
          );
        } catch {
          return false;
        }
        if (
          !$from.parent.canReplace($from.index(), $to.indexAfter(), replacement)
        ) {
          return false;
        }
        let carriesMark = false;
        replacement.forEach((node) => {
          carriesMark ||= canCarryCommentMark(node, $from.parent);
        });
        if (sameRange.length > 0 && !carriesMark) {
          return false;
        }

        if (dispatch) {
          tr.replaceWith(range.from, range.to, replacement);
        }
        return true;
      },
    setActiveComment:
      (id) =>
      ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta(documentCommentsPluginKey, {
            type: "active",
            id,
          } satisfies DocumentCommentsMeta);
        }
        return true;
      },
  }),
  addProseMirrorPlugins: () => [
    new Plugin<DocumentCommentsState>({
      key: documentCommentsPluginKey,
      state: {
        init: (_, state) => ({
          activeId: null,
          draft: null,
          decorations: buildDecorations(state.doc, null, null),
        }),
        apply: (transaction, previous, oldState, newState) => {
          const meta: DocumentCommentsMeta | undefined = transaction.getMeta(
            documentCommentsPluginKey
          );
          if (!transaction.docChanged && meta === undefined) {
            return previous;
          }

          let { activeId, draft } = previous;
          if (draft && transaction.docChanged) {
            const from = transaction.mapping.map(draft.from, 1);
            const to = transaction.mapping.map(draft.to, -1);
            draft = from < to ? { from, to } : null;
          }

          switch (meta?.type) {
            case "draft":
              draft = { from: meta.from, to: meta.to };
              break;
            case "cancelDraft":
              draft = null;
              break;
            case "commit":
              draft = null;
              activeId = meta.id;
              break;
            case "active":
              activeId = meta.id;
              break;
            case undefined:
              break;
          }

          const threadsChanged =
            oldState.doc.attrs[COMMENTS_ATTRIBUTE] !==
            newState.doc.attrs[COMMENTS_ATTRIBUTE];
          if (
            threadsChanged &&
            activeId !== null &&
            !getDocumentComments(newState.doc).some(
              (comment) => comment.id === activeId
            )
          ) {
            activeId = null;
          }

          return {
            activeId,
            draft,
            // A draft's range maps like its highlight: neither grows at its edges.
            decorations:
              meta !== undefined ||
              threadsChanged ||
              activeId !== previous.activeId
                ? buildDecorations(newState.doc, activeId, draft)
                : updateDecorations(
                    previous.decorations,
                    transaction,
                    activeId
                  ),
          };
        },
      },
      props: {
        decorations(state) {
          return this.getState(state)?.decorations;
        },
      },
    }),
  ],
});
