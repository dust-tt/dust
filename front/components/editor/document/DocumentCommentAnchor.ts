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

export const COMMENT_ANCHOR_NODE_NAME = "commentAnchor";

type AnchorKind = "start" | "end";

const isAnchorKind = (value: unknown): value is AnchorKind =>
  value === "start" || value === "end";

/**
 * One end of a DFM comment anchor pair, as the Markdown parser reads it and the serializer
 * writes it. It only exists between Markdown and the editor: `anchorsToMarks` turns pairs into
 * comment marks after parsing, `marksToAnchors` turns marks back into pairs before serializing.
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

const anchorNode = (kind: AnchorKind, id: string): JSONContent => ({
  type: COMMENT_ANCHOR_NODE_NAME,
  attrs: { kind, id },
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

/**
 * @cc [owner:tdraier,label:product] document-anchors-to-marks
 * Each anchor pair MUST become a comment mark on every text node between its start and its end
 * that can carry one, and the anchor nodes MUST be removed. An end without its start, a
 * duplicate start, a start never closed, or a pair covering no text that can carry a mark MUST
 * fail, so a file never opens with a comment the editor would drop on save.
 */
export const anchorsToMarks = (
  document: JSONContent,
  schema: Schema
): Result<JSONContent, string> => {
  const markType = schema.marks[COMMENT_MARK_NAME];
  const open: string[] = [];
  const started = new Set<string>();
  const marked = new Set<string>();
  let error: string | null = null;

  const canCarryMark = (text: JSONContent, parent: JSONContent) =>
    !!parent.type &&
    !!schema.nodes[parent.type]?.allowsMarkType(markType) &&
    !(text.marks ?? []).some((mark) =>
      schema.marks[mark.type]?.excludes(markType)
    );

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
          open.push(id);
        } else if (kind === "end" && open.includes(id)) {
          open.splice(open.indexOf(id), 1);
        } else {
          error ??= `Comment anchor "${id}" is not paired where the editor reads it.`;
        }
        continue;
      }
      if (
        child.type === "text" &&
        open.length > 0 &&
        canCarryMark(child, node)
      ) {
        for (const id of open) {
          marked.add(id);
        }
        content.push({
          ...child,
          marks: [
            ...(child.marks ?? []),
            ...open.map((id) => ({ type: COMMENT_MARK_NAME, attrs: { id } })),
          ],
        });
        continue;
      }
      content.push(rebuild(child));
    }
    return { ...node, content };
  };

  const converted = rebuild(document);
  if (error === null && open.length > 0) {
    error = `Comment anchor "${open[0]}" is never closed where the editor reads it.`;
  }
  const unmarked = [...started].find((id) => !marked.has(id));
  if (error === null && unmarked !== undefined) {
    error = `Comment "${unmarked}" covers no text the editor can highlight.`;
  }
  return error === null ? new Ok(converted) : new Err(error);
};

/**
 * @cc [owner:tdraier,label:product] document-marks-to-anchors
 * Each comment id carried by marks MUST become exactly one anchor pair: the start right before
 * the first text node carrying it and the end right after the last, in document order, with
 * comment marks removed from the text. Anchor nodes MUST carry no other mark.
 */
export const marksToAnchors = (document: JSONContent): JSONContent => {
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

  let position = 0;
  const rebuild = (node: JSONContent): JSONContent => {
    if (!node.content) {
      return node;
    }
    const content: JSONContent[] = [];
    for (const child of node.content) {
      if (child.type !== "text") {
        content.push(rebuild(child));
        continue;
      }
      const at = position++;
      content.push(
        ...(startsAt.get(at) ?? []).map((id) => anchorNode("start", id))
      );
      const { marks, ...text } = child;
      const kept = (marks ?? []).filter(
        (mark) => mark.type !== COMMENT_MARK_NAME
      );
      content.push(kept.length > 0 ? { ...text, marks: kept } : text);
      content.push(
        ...(endsAt.get(at) ?? []).map((id) => anchorNode("end", id))
      );
    }
    return { ...node, content };
  };

  return rebuild(document);
};
