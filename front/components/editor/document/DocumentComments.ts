import type { DfmComment } from "@app/lib/markdown/dfm";
import { cn } from "@dust-tt/sparkle";
import type { Editor, JSONContent } from "@tiptap/core";
import { Extension, isMacOS, Mark } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  AddMarkStep,
  RemoveMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
} from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { z } from "zod";

export const COMMENT_MARK_NAME = "comment";
const COMMENTS_ATTRIBUTE = "comments";

const commentsSchema: z.ZodType<DfmComment[]> = z.array(
  z.object({
    id: z.string(),
    status: z.enum(["open", "resolved"]),
    messages: z.array(
      z.object({
        author: z.object({
          kind: z.enum(["user", "agent"]),
          id: z.string(),
          name: z.string(),
        }),
        createdAt: z.string(),
        body: z.string(),
      })
    ),
  })
);

const HIGHLIGHT_CLASS = cn(
  "cursor-pointer border-b-2 border-golden-400/70 bg-golden-300/40 transition-colors",
  "hover:bg-golden-300/60 dark:border-golden-500/70 dark:bg-golden-400/25 dark:hover:bg-golden-400/40",
  "motion-reduce:transition-none print:border-transparent print:bg-transparent"
);
// Dark alphas keep stone-200 text above 4.5:1 on the composited highlight.
const ACTIVE_HIGHLIGHT_CLASS = cn(
  "border-golden-500 bg-golden-300/80 hover:bg-golden-300/80",
  "dark:border-golden-400 dark:bg-golden-400/40 dark:hover:bg-golden-400/40"
);

interface DocumentCommentsState {
  activeId: string | null;
  decorations: DecorationSet;
}

type DocumentCommentsMeta = { type: "active"; id: string | null };

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
    return commentsSchema.parse(value);
  }
  const cached = parsedThreads.get(value);
  if (cached) {
    return cached;
  }
  const parsed = commentsSchema.parse(value);
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

const commentedTexts = new WeakMap<Node, Map<string, string>>();

/** Text covered by each comment, in document order, joined across blocks. */
export const getCommentedTexts = (doc: Node): Map<string, string> => {
  const cached = commentedTexts.get(doc);
  if (cached) {
    return cached;
  }
  const texts = new Map<string, string>();

  doc.descendants((node) => {
    if (!node.isText) {
      return;
    }
    for (const mark of node.marks) {
      if (mark.type.name === COMMENT_MARK_NAME) {
        texts.set(
          mark.attrs.id,
          (texts.get(mark.attrs.id) ?? "") + (node.text ?? "")
        );
      }
    }
  });

  commentedTexts.set(doc, texts);
  return texts;
};

const buildDecorations = (doc: Node, activeId: string | null) => {
  const commentsById = new Map(
    getDocumentComments(doc).map((comment) => [comment.id, comment])
  );
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }

    for (const mark of node.marks) {
      if (mark.type.name !== COMMENT_MARK_NAME) {
        continue;
      }

      const comment = commentsById.get(mark.attrs.id);
      if (!comment || comment.status === "resolved") {
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

  return DecorationSet.create(doc, decorations);
};

/**
 * Whether a transaction may add or remove comment-marked text, which mapping the highlights
 * cannot follow: a mark step on comments, or a replacement inserting commented content, such
 * as undo restoring deleted commented text. Typing inside a comment counts, since the typed
 * text carries the mark.
 */
const changesCommentMarks = (transaction: Transaction) =>
  transaction.steps.some((step) => {
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
      return step.mark.type.name === COMMENT_MARK_NAME;
    }
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      let commented = false;
      step.slice.content.descendants((node) => {
        commented ||= node.marks.some(
          (mark) => mark.type.name === COMMENT_MARK_NAME
        );
        return !commented;
      });
      return commented;
    }
    return false;
  });

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentComments: {
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
 * Comment marks MUST come only from the file's anchors, never from parsed HTML, pasted content
 * or a copy dropped from a drag, so a copy cannot widen a comment to everything between it and
 * its source or anchor one that has no thread. Text moved by a drag MUST keep its marks.
 */
const withoutCommentMarks = (fragment: Fragment): Fragment => {
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    nodes.push(
      node.isText
        ? node.mark(
            node.marks.filter((mark) => mark.type.name !== COMMENT_MARK_NAME)
          )
        : node.copy(withoutCommentMarks(node.content))
    );
  });
  return Fragment.fromArray(nodes);
};

export const DocumentCommentMark = Mark.create({
  name: COMMENT_MARK_NAME,
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
  addProseMirrorPlugins: () => {
    // ProseMirror runs transformPasted before deciding whether a drop moves or copies; the drop
    // event arrives first, with the copy modifier ProseMirror itself reads.
    let dropCopies = false;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            drop: (_view, event) => {
              dropCopies = event[isMacOS() ? "altKey" : "ctrlKey"];
              return false;
            },
          },
          transformPasted: (slice, view) =>
            view.dragging && !dropCopies
              ? slice
              : new Slice(
                  withoutCommentMarks(slice.content),
                  slice.openStart,
                  slice.openEnd
                ),
        },
      }),
    ];
  },
});

/**
 * @cc [owner:tdraier,label:product] document-comments-in-doc
 * While the document is open, comment threads MUST live in the document's `comments`
 * attribute as DFM threads and anchor to text through comment marks, so dirty tracking and
 * autosave cover comment changes.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-highlights
 * Open comments MUST render as highlights over their marked text. Resolved comments and
 * comments without a thread MUST render as plain text. The active comment MUST render with
 * the emphasized highlight.
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
            commentsSchema.parse(value);
          },
        },
      },
    },
  ],
  addCommands: () => ({
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
          decorations: buildDecorations(state.doc, null),
        }),
        apply: (transaction, previous, oldState, newState) => {
          const meta: DocumentCommentsMeta | undefined = transaction.getMeta(
            documentCommentsPluginKey
          );
          if (!transaction.docChanged && meta === undefined) {
            return previous;
          }

          const threadsChanged =
            oldState.doc.attrs[COMMENTS_ATTRIBUTE] !==
            newState.doc.attrs[COMMENTS_ATTRIBUTE];
          let activeId = meta ? meta.id : previous.activeId;
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
            decorations:
              threadsChanged ||
              activeId !== previous.activeId ||
              changesCommentMarks(transaction)
                ? buildDecorations(newState.doc, activeId)
                : previous.decorations.map(
                    transaction.mapping,
                    transaction.doc
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
