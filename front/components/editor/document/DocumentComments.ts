import type { DfmComment } from "@app/lib/markdown/dfm";
import { cn } from "@dust-tt/sparkle";
import type { Editor, JSONContent } from "@tiptap/core";
import { Extension, Mark } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
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
export const getDocumentComments = (doc: Node): DfmComment[] =>
  commentsSchema.parse(doc.attrs[COMMENTS_ATTRIBUTE] ?? []);

/** The threads a document JSON carries, as getJSON returns them. */
export const getDocumentJSONComments = (document: JSONContent): DfmComment[] =>
  commentsSchema.parse(document.attrs?.[COMMENTS_ATTRIBUTE] ?? []);

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
 * Comment marks MUST come only from the file's anchors, never from parsed HTML, so pasted
 * text cannot widen a comment or anchor one that has no thread.
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
      renderHTML: (attributes) => ({ "data-comment-id": attributes.id }),
    },
  }),
  parseHTML: () => [],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
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
        apply: (transaction, previous, _oldState, newState) => {
          const meta: DocumentCommentsMeta | undefined = transaction.getMeta(
            documentCommentsPluginKey
          );
          let activeId = meta ? meta.id : previous.activeId;

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
            decorations: buildDecorations(newState.doc, activeId),
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
