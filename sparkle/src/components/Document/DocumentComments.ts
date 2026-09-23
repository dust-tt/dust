import { cn } from "@sparkle/lib/utils";
import { type Editor, Extension, Mark } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { z } from "zod";
import type { DocumentComment, DocumentCommentReply } from "./types";

export const COMMENT_MARK_NAME = "comment";
const COMMENTS_ATTRIBUTE = "comments";

const authorSchema = z.object({
  name: z.string(),
  avatarUrl: z.string().nullable().optional(),
});
const replySchema = z.object({
  id: z.string().min(1),
  body: z.string(),
  author: authorSchema,
  createdAt: z.string(),
});
const commentSchema = replySchema.extend({
  resolved: z.boolean(),
  replies: z.array(replySchema),
});
const commentsSchema = z.array(commentSchema);

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

export const getDocumentComments = (doc: Node): DocumentComment[] =>
  (doc.attrs[COMMENTS_ATTRIBUTE] as DocumentComment[] | undefined) ?? [];

/** First rendered highlight of an unresolved comment, if any. */
export const findCommentHighlight = (editor: Editor, id: string) =>
  editor.view.dom.querySelector<HTMLElement>(
    `[data-comment-highlight="${id.replace(/["\\]/g, "\\$&")}"]`
  );

export const scrollToCommentHighlight = (editor: Editor, id: string) => {
  findCommentHighlight(editor, id)?.scrollIntoView({
    block: "center",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
};

/** Text covered by each comment, in document order, joined across blocks. */
export const getCommentedTexts = (doc: Node): Map<string, string> => {
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

  return texts;
};

const buildDecorations = (
  doc: Node,
  activeId: string | null,
  draft: DocumentCommentDraft | null
) => {
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
      if (!comment || comment.resolved) {
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

  if (draft) {
    decorations.push(
      Decoration.inline(draft.from, draft.to, {
        nodeName: "span",
        class: cn(HIGHLIGHT_CLASS, ACTIVE_HIGHLIGHT_CLASS),
        "data-comment-draft": "",
      })
    );
  }

  return DecorationSet.create(doc, decorations);
};

const updateComment = (
  comments: DocumentComment[],
  id: string,
  update: (comment: DocumentComment) => DocumentComment
) => comments.map((comment) => (comment.id === id ? update(comment) : comment));

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentComments: {
      /** Marks the current text selection as the range of a comment being written. */
      startCommentDraft: () => ReturnType;
      cancelCommentDraft: () => ReturnType;
      /** Attaches the comment to the draft range and makes it the active comment. */
      addComment: (comment: DocumentComment) => ReturnType;
      replyToComment: (id: string, reply: DocumentCommentReply) => ReturnType;
      setCommentResolved: (id: string, resolved: boolean) => ReturnType;
      /** Removes the comment and every mark that anchors it. */
      deleteComment: (id: string) => ReturnType;
      setActiveComment: (id: string | null) => ReturnType;
    };
  }
}

/**
 * @cc [owner:flvndvd,label:product] document-comment-anchor
 * Comment marks MUST store only the comment id. Marks MUST NOT extend to text typed at
 * their edges. Distinct comments MUST be allowed on overlapping text.
 */
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
      parseHTML: (element) => element.getAttribute("data-comment-id"),
      renderHTML: (attributes) => ({ "data-comment-id": attributes.id }),
    },
  }),
  parseHTML: () => [{ tag: "span[data-comment-id]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
});

/**
 * @cc [owner:flvndvd,label:product] document-comments-in-json
 * Comment threads MUST persist in the document's `comments` attribute and anchor to text
 * through comment marks, so a saved JSON document carries its comments. Stored comments
 * MUST satisfy the comment schema before the document opens. Deleting a comment MUST remove
 * its marks. Resolving MUST keep them so the thread can be reopened in place.
 */
/**
 * @cc [owner:flvndvd,label:react] document-comment-highlights
 * Unresolved comments MUST render as highlights over their marked text. Resolved comments and
 * comments without a thread MUST render as plain text. The active comment and a pending draft
 * MUST render with the emphasized highlight.
 */
/**
 * @cc [owner:flvndvd,label:product] document-comment-draft-range
 * A pending draft range MUST follow document edits around it without growing from text
 * inserted at its edges. A draft whose range collapses MUST be dropped. Starting a draft
 * MUST collapse the selection to the end of the range.
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
    startCommentDraft:
      () =>
      ({ state, tr, dispatch }) => {
        const { selection } = state;
        if (
          !(selection instanceof TextSelection) ||
          selection.empty ||
          state.doc.textBetween(selection.from, selection.to).length === 0
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
        if (!draft) {
          return false;
        }

        if (dispatch) {
          tr.addMark(
            draft.from,
            draft.to,
            state.schema.marks[COMMENT_MARK_NAME].create({ id: comment.id })
          );
          tr.setDocAttribute(COMMENTS_ATTRIBUTE, [
            ...getDocumentComments(state.doc),
            comment,
          ]);
          tr.setMeta(documentCommentsPluginKey, {
            type: "commit",
            id: comment.id,
          } satisfies DocumentCommentsMeta);
        }
        return true;
      },
    replyToComment:
      (id, reply) =>
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
              replies: [...comment.replies, reply],
            }))
          );
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
            updateComment(comments, id, (comment) => ({ ...comment, resolved }))
          );
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
        apply: (transaction, previous, _oldState, newState) => {
          const meta = transaction.getMeta(documentCommentsPluginKey) as
            | DocumentCommentsMeta
            | undefined;
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

          if (
            activeId !== null &&
            !getDocumentComments(newState.doc).some(
              (comment) => comment.id === activeId
            )
          ) {
            activeId = null;
          }

          if (!transaction.docChanged && meta === undefined) {
            return previous;
          }

          return {
            activeId,
            draft,
            decorations: buildDecorations(newState.doc, activeId, draft),
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
