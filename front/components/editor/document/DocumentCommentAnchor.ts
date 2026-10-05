import { COMMENT_MARK_NAME } from "@app/components/editor/document/DocumentComments";
import {
  anchorDirective,
  findAnchorDirective,
  readAnchorDirective,
} from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { JSONContent } from "@tiptap/core";
import { Node } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import isEqual from "lodash/isEqual";

export const COMMENT_ANCHOR_NODE_NAME = "commentAnchor";

type AnchorKind = "start" | "end";

const isAnchorKind = (value: unknown): value is AnchorKind =>
  value === "start" || value === "end";

/**
 * One end of a DFM comment anchor pair, as the Markdown parser reads it. It only exists between
 * Markdown and the editor: `anchorsToMarks` turns pairs into comment marks after parsing, and
 * `marksToAnchors` writes marks back as anchors before serializing.
 */
export const DocumentCommentAnchor = Node.create({
  name: COMMENT_ANCHOR_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes: () => ({
    kind: { default: null, rendered: false },
    id: { default: null, rendered: false },
  }),
  renderHTML: () => ["span", { "data-comment-anchor": "" }],
  markdownTokenizer: {
    name: COMMENT_ANCHOR_NODE_NAME,
    level: "inline",
    start: (src) => findAnchorDirective(src),
    tokenize: (src) => {
      const directive = readAnchorDirective(src);
      if (!directive) {
        return undefined;
      }
      return {
        type: COMMENT_ANCHOR_NODE_NAME,
        raw: src.slice(0, directive.length),
        kind: directive.kind,
        id: directive.id,
      };
    },
  },
  parseMarkdown: (token) => ({
    type: COMMENT_ANCHOR_NODE_NAME,
    attrs: { kind: token.kind, id: token.id },
  }),
  renderMarkdown: (node) =>
    isAnchorKind(node.attrs?.kind) && isString(node.attrs?.id)
      ? anchorDirective(node.attrs.kind, node.attrs.id)
      : "",
});

const commentMarkIds = (node: JSONContent): string[] =>
  (node.marks ?? []).flatMap((mark) =>
    mark.type === COMMENT_MARK_NAME && isString(mark.attrs?.id)
      ? [mark.attrs.id]
      : []
  );

/** Calls `visit` on every text node in document order, with its parent. */
const forEachText = (
  node: JSONContent,
  visit: (text: JSONContent, parent: JSONContent) => void
) => {
  for (const child of node.content ?? []) {
    if (child.type === "text") {
      visit(child, node);
    } else {
      forEachText(child, visit);
    }
  }
};

/** Ids of the comments marked somewhere in the document. */
export const getMarkedCommentIds = (document: JSONContent): Set<string> => {
  const ids = new Set<string>();
  forEachText(document, (text) => {
    for (const id of commentMarkIds(text)) {
      ids.add(id);
    }
  });
  return ids;
};

/** An anchor directive as `start:<id>` or `end:<id>`, to remember the order a file has them in. */
const markerKey = (kind: AnchorKind, id: string) => `${kind}:${id}`;

export interface MarkedDocument {
  document: JSONContent;
  /** The anchor directives in the order the file has them, by `markerKey`. */
  anchorOrder: string[];
}

/**
 * @cc [owner:tdraier,label:product] document-anchors-to-marks
 * Each anchor pair MUST become a comment mark on every text node between its start and its end
 * that can carry one, and the anchor nodes MUST be removed. An end without its start, a
 * duplicate start, a start never closed, a pair covering no text that can carry a mark, or a
 * pair whose first or last covered text cannot carry one MUST fail, so a file never opens with
 * a comment the editor would drop or shrink on save. The anchors' order in the file MUST be
 * returned.
 */
export const anchorsToMarks = (
  document: JSONContent,
  schema: Schema
): Result<MarkedDocument, string> => {
  const markType = schema.marks[COMMENT_MARK_NAME];
  const open = new Set<string>();
  const started = new Set<string>();
  const marked = new Set<string>();
  // Covered text the mark cannot carry, before a comment's first marked text or after its last.
  const unmarkedLead = new Set<string>();
  const unmarkedTail = new Set<string>();
  const anchorOrder: string[] = [];
  let error: string | null = null;

  const canCarryMark = (text: JSONContent, parent: JSONContent) =>
    !!parent.type &&
    !!schema.nodes[parent.type]?.allowsMarkType(markType) &&
    !(text.marks ?? []).some((mark) =>
      schema.marks[mark.type]?.excludes(markType)
    );

  const shrinks = (id: string) =>
    `Comment "${id}" starts or ends on text the editor cannot highlight.`;

  const rebuild = (node: JSONContent): JSONContent => {
    if (!node.content) {
      return node;
    }
    const content: JSONContent[] = [];
    for (const child of node.content) {
      if (child.type === COMMENT_ANCHOR_NODE_NAME) {
        const { kind, id } = child.attrs ?? {};
        if (kind === "start" && !started.has(id)) {
          started.add(id);
          open.add(id);
          anchorOrder.push(markerKey(kind, id));
        } else if (kind === "end" && open.has(id)) {
          open.delete(id);
          anchorOrder.push(markerKey(kind, id));
          if (unmarkedTail.has(id)) {
            error ??= shrinks(id);
          }
        } else {
          error ??= `Comment anchor "${id}" is not paired where the editor reads it.`;
        }
        continue;
      }
      if (child.type === "text" && open.size > 0) {
        if (canCarryMark(child, node)) {
          for (const id of open) {
            if (unmarkedLead.has(id) && !marked.has(id)) {
              error ??= shrinks(id);
            }
            marked.add(id);
            unmarkedTail.delete(id);
          }
          content.push({
            ...child,
            marks: [
              ...(child.marks ?? []),
              ...[...open].map((id) => ({
                type: COMMENT_MARK_NAME,
                attrs: { id },
              })),
            ],
          });
          continue;
        }
        for (const id of open) {
          (marked.has(id) ? unmarkedTail : unmarkedLead).add(id);
        }
      }
      content.push(rebuild(child));
    }
    return { ...node, content };
  };

  const converted = rebuild(document);
  const [unclosed] = open;
  if (error === null && unclosed !== undefined) {
    error = `Comment anchor "${unclosed}" is never closed where the editor reads it.`;
  }
  const unmarked = [...started].find((id) => !marked.has(id));
  if (error === null && unmarked !== undefined) {
    error = `Comment "${unmarked}" covers no text the editor can highlight.`;
  }
  return error === null
    ? new Ok({ document: converted, anchorOrder })
    : new Err(error);
};

/** Private-use characters, which the Markdown serializer neither escapes nor encodes. */
const PLACEHOLDER_OPEN = "\uE000";
const PLACEHOLDER_CLOSE = "\uE001";

export interface AnchoredDocument {
  /** The document with each anchor as a placeholder text run. */
  document: JSONContent;
  /** The anchor directive standing for each placeholder, to substitute after serializing. */
  directives: Map<string, string>;
}

const nonCommentMarks = (text: JSONContent | undefined) =>
  text?.type === "text"
    ? (text.marks ?? []).filter((mark) => mark.type !== COMMENT_MARK_NAME)
    : [];

/** The marks two neighbours both carry: an anchor between them sits inside these. */
const sharedMarks = (
  before: JSONContent | undefined,
  after: JSONContent | undefined
) => {
  const next = nonCommentMarks(after);
  return nonCommentMarks(before).filter((mark) =>
    next.some((other) => isEqual(other, mark))
  );
};

interface Marker {
  kind: AnchorKind;
  id: string;
}

/**
 * @cc [owner:tdraier,label:product] document-marks-to-anchors
 * Each comment id carried by marks MUST become exactly one anchor pair: the start right before
 * the first text node carrying it and the end right after the last, in document order, with
 * comment marks removed from the text. Each anchor MUST carry the marks shared by the text on
 * both sides of it, so formatting that crosses a comment's edge is written as one run. Anchors meeting between the same two texts MUST keep the order `anchorOrder` gives
 * them when it knows them all; otherwise ends MUST come first, the latest opened closing first,
 * then starts, the longest opening first.
 */
export const marksToAnchors = (
  document: JSONContent,
  anchorOrder: string[] = []
): AnchoredDocument => {
  const firstText = new Map<string, number>();
  const lastText = new Map<string, number>();
  let index = 0;
  forEachText(document, (text) => {
    for (const id of commentMarkIds(text)) {
      if (!firstText.has(id)) {
        firstText.set(id, index);
      }
      lastText.set(id, index);
    }
    index++;
  });

  const byText = (positions: Map<string, number>) => {
    const ids = new Map<number, string[]>();
    for (const [id, at] of positions) {
      ids.set(at, [...(ids.get(at) ?? []), id]);
    }
    return ids;
  };
  const startsAt = byText(firstText);
  const endsAt = byText(lastText);
  const fileRank = new Map(anchorOrder.map((key, rank) => [key, rank]));
  const openingRank = new Map(
    [...firstText.keys()].map((id, rank) => [id, rank])
  );

  const ordered = (markers: Marker[]): Marker[] => {
    if (markers.every(({ kind, id }) => fileRank.has(markerKey(kind, id)))) {
      return [...markers].sort(
        (a, b) =>
          (fileRank.get(markerKey(a.kind, a.id)) ?? 0) -
          (fileRank.get(markerKey(b.kind, b.id)) ?? 0)
      );
    }
    const rank = (id: string) => openingRank.get(id) ?? 0;
    const ends = markers
      .filter(({ kind }) => kind === "end")
      .sort(
        (a, b) =>
          (firstText.get(b.id) ?? 0) - (firstText.get(a.id) ?? 0) ||
          rank(b.id) - rank(a.id)
      );
    const starts = markers
      .filter(({ kind }) => kind === "start")
      .sort(
        (a, b) =>
          (lastText.get(b.id) ?? 0) - (lastText.get(a.id) ?? 0) ||
          rank(a.id) - rank(b.id)
      );
    return [...ends, ...starts];
  };

  const directives = new Map<string, string>();
  // The serializer closes every mark around a non-text node, which would split `*foo bar*`
  // around an anchor into `*foo *` and `*bar*`. A text run carrying the shared marks does not.
  const placeholders = (
    markers: Marker[],
    marks: JSONContent["marks"]
  ): JSONContent[] =>
    ordered(markers).map(({ kind, id }) => {
      const placeholder = `${PLACEHOLDER_OPEN}${directives.size}${PLACEHOLDER_CLOSE}`;
      directives.set(placeholder, anchorDirective(kind, id));
      return marks && marks.length > 0
        ? { type: "text", text: placeholder, marks }
        : { type: "text", text: placeholder };
    });
  const starting = (at: number): Marker[] =>
    (startsAt.get(at) ?? []).map((id) => ({ kind: "start", id }));
  const ending = (at: number): Marker[] =>
    (endsAt.get(at) ?? []).map((id) => ({ kind: "end", id }));

  let position = 0;
  const rebuild = (node: JSONContent): JSONContent => {
    if (!node.content) {
      return node;
    }
    const siblings = node.content;
    const content: JSONContent[] = [];
    for (const [i, child] of siblings.entries()) {
      if (child.type !== "text") {
        content.push(rebuild(child));
        continue;
      }
      const at = position++;
      const previous = siblings[i - 1];
      const next = siblings[i + 1];
      // Anchors between two texts are written once, after the first, as one ordered group.
      if (previous?.type !== "text") {
        content.push(...placeholders(starting(at), []));
      }
      const { marks: _marks, ...text } = child;
      const kept = nonCommentMarks(child);
      content.push(kept.length > 0 ? { ...text, marks: kept } : text);
      content.push(
        ...placeholders(
          [...ending(at), ...(next?.type === "text" ? starting(at + 1) : [])],
          sharedMarks(child, next)
        )
      );
    }
    return { ...node, content };
  };

  return { document: rebuild(document), directives };
};
