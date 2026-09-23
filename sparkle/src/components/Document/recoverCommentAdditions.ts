import type { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Transform } from "@tiptap/pm/transform";
import { normalizeTextNodes } from "./content";
import { COMMENT_MARK_NAME, getDocumentComments } from "./DocumentComments";
import type { DocumentComment, DocumentCommentReply } from "./types";

interface CommentRange {
  from: number;
  to: number;
}

interface CommentAddition {
  comment: DocumentComment;
  ranges: CommentRange[];
  isNew: boolean;
  replies: DocumentCommentReply[];
}

const sameReply = (a: DocumentCommentReply, b: DocumentCommentReply) =>
  a.id === b.id &&
  a.body === b.body &&
  a.createdAt === b.createdAt &&
  a.author.name === b.author.name &&
  a.author.avatarUrl === b.author.avatarUrl;

const sameThread = (a: DocumentComment, b: DocumentComment) =>
  sameReply(a, b) && a.resolved === b.resolved;

const commentRanges = (doc: Node) => {
  const ranges = new Map<string, CommentRange[]>();
  doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }
    for (const mark of node.marks) {
      if (mark.type.name !== COMMENT_MARK_NAME) {
        continue;
      }
      const id: string = mark.attrs.id;
      const previous = ranges.get(id) ?? [];
      const last = previous[previous.length - 1];
      if (last?.to === pos) {
        last.to = pos + node.nodeSize;
      } else {
        previous.push({ from: pos, to: pos + node.nodeSize });
      }
      ranges.set(id, previous);
    }
  });
  return ranges;
};

const sameRanges = (a: CommentRange[], b: CommentRange[]) =>
  a.length === b.length &&
  a.every((range, i) => range.from === b[i].from && range.to === b[i].to);

const withoutComments = (doc: Node) =>
  normalizeTextNodes(
    new Transform(doc)
      .removeMark(0, doc.content.size, doc.type.schema.marks[COMMENT_MARK_NAME])
      .setDocAttribute("comments", []).doc
  );

const additionsSince = (base: Node, draft: Node): CommentAddition[] | null => {
  if (!withoutComments(base).eq(withoutComments(draft))) {
    return null;
  }

  const before = getDocumentComments(base);
  const after = getDocumentComments(draft);
  const beforeById = new Map(before.map((comment) => [comment.id, comment]));
  const afterById = new Map(after.map((comment) => [comment.id, comment]));
  const beforeRanges = commentRanges(base);
  const afterRanges = commentRanges(draft);
  if (
    beforeById.size !== before.length ||
    afterById.size !== after.length ||
    before.some((comment) => !afterById.has(comment.id)) ||
    [...beforeRanges.keys()].some((id) => !beforeById.has(id)) ||
    [...afterRanges.keys()].some((id) => !afterById.has(id))
  ) {
    return null;
  }

  const additions: CommentAddition[] = [];
  for (const comment of after) {
    const previous = beforeById.get(comment.id);
    const ranges = afterRanges.get(comment.id) ?? [];
    const repliesById = new Map(
      comment.replies.map((reply) => [reply.id, reply])
    );
    if (repliesById.size !== comment.replies.length) {
      return null;
    }
    if (!previous) {
      if (ranges.length === 0) {
        return null;
      }
      additions.push({
        comment,
        ranges,
        isNew: true,
        replies: comment.replies,
      });
      continue;
    }

    const previousReplies = new Map(
      previous.replies.map((reply) => [reply.id, reply])
    );
    if (
      !sameThread(previous, comment) ||
      !sameRanges(beforeRanges.get(comment.id) ?? [], ranges) ||
      previousReplies.size !== previous.replies.length ||
      previous.replies.some((reply) => {
        const current = repliesById.get(reply.id);
        return !current || !sameReply(reply, current);
      })
    ) {
      return null;
    }
    const replies = comment.replies.filter(
      (reply) => !previousReplies.has(reply.id)
    );
    if (replies.length > 0) {
      additions.push({ comment, ranges, isNew: false, replies });
    }
  }
  return additions;
};

const replayAdditions = (
  doc: Node,
  additions: CommentAddition[]
): DocumentComment[] | null => {
  const comments = new Map(
    getDocumentComments(doc).map((comment) => [comment.id, comment])
  );
  const rangesById = commentRanges(doc);
  for (const addition of additions) {
    const { comment, ranges, isNew } = addition;
    const existing = comments.get(comment.id);
    if (!existing) {
      if (!isNew) {
        return null;
      }
      comments.set(comment.id, comment);
      continue;
    }
    if (
      !sameThread(existing, comment) ||
      !sameRanges(rangesById.get(comment.id) ?? [], ranges)
    ) {
      return null;
    }
    const replies = new Map(existing.replies.map((reply) => [reply.id, reply]));
    for (const reply of addition.replies) {
      const duplicate = replies.get(reply.id);
      if (duplicate && !sameReply(duplicate, reply)) {
        return null;
      }
      replies.set(reply.id, reply);
    }
    comments.set(comment.id, { ...existing, replies: [...replies.values()] });
  }
  return [...comments.values()];
};

/**
 * @cc [owner:flvndvd,label:product] document-comment-conflict-recovery
 * Recovery MUST accept only added comments and replies on an unchanged document body on
 * both sides. Text, formatting, structure, existing anchors, edits, resolution and deletion
 * MUST NOT be reconciled automatically. Retried additions MUST be deduplicated by id, with
 * different payloads or anchors for the same id rejected. Remote comments MUST stay out of
 * text undo history. The returned transaction MUST preserve selection and editor plugins.
 */
export const recoverCommentAdditions = (
  state: EditorState,
  base: Node,
  latest: Node
): Transaction | null => {
  const local = additionsSince(base, state.doc);
  const remote = additionsSince(base, latest);
  if (!local?.length || !remote) {
    return null;
  }
  const recovered = replayAdditions(latest, local);
  if (!recovered) {
    return null;
  }

  // Apply only the remote marks: replacing editor content would disrupt text history.
  const tr = state.tr;
  const currentIds = new Set(
    getDocumentComments(state.doc).map((comment) => comment.id)
  );
  for (const addition of remote) {
    if (addition.isNew && !currentIds.has(addition.comment.id)) {
      const mark = state.schema.marks[COMMENT_MARK_NAME].create({
        id: addition.comment.id,
      });
      for (const range of addition.ranges) {
        tr.addMark(range.from, range.to, mark);
      }
    }
  }
  return tr
    .setDocAttribute("comments", recovered)
    .setMeta("addToHistory", false);
};
