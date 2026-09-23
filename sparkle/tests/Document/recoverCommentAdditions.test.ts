import { getDocumentComments } from "@sparkle/components/Document/DocumentComments";
import { documentExtensions } from "@sparkle/components/Document/extensions";
import { recoverCommentAdditions } from "@sparkle/components/Document/recoverCommentAdditions";
import type {
  DocumentComment,
  DocumentCommentReply,
} from "@sparkle/components/Document/types";
import { getSchema } from "@tiptap/core";
import { history, undo } from "@tiptap/pm/history";
import type { Node } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { Transform } from "@tiptap/pm/transform";
import { describe, expect, it } from "vitest";

const schema = getSchema(documentExtensions);
const reply = (id: string): DocumentCommentReply => ({
  id,
  body: `${id} reply`,
  author: { name: id },
  createdAt: "2026-09-23T10:00:00.000Z",
});
const comment = (id: string): DocumentComment => ({
  ...reply(id),
  resolved: false,
  replies: [],
});
const document = () =>
  schema.node("doc", null, [
    schema.node("paragraph", null, schema.text("Original text")),
  ]);
const withComment = (doc: Node, thread: DocumentComment, from = 1, to = 8) =>
  new Transform(doc)
    .setDocAttribute("comments", [...getDocumentComments(doc), thread])
    .addMark(from, to, schema.marks.comment.create({ id: thread.id })).doc;
const withReplies = (doc: Node, replies: DocumentCommentReply[]) =>
  new Transform(doc).setDocAttribute("comments", [
    { ...comment("thread"), replies },
  ]).doc;

describe("comment addition recovery", () => {
  it("combines overlapping comments without replacing selection or text history", () => {
    const base = document();
    const local = withComment(base, comment("local"));
    const latest = withComment(base, comment("remote"), 3, 10);
    let state = EditorState.create({
      doc: local,
      selection: TextSelection.create(local, 8),
      plugins: [history()],
    });
    const recovery = recoverCommentAdditions(state, base, latest);
    expect(recovery).not.toBeNull();
    if (!recovery) {
      return;
    }
    state = state.apply(recovery);
    expect(state.selection.from).toBe(8);
    expect(getDocumentComments(state.doc)).toEqual([
      comment("remote"),
      comment("local"),
    ]);
    expect(
      state.doc
        .resolve(5)
        .marks()
        .map((mark) => mark.attrs.id)
        .sort()
    ).toEqual(["local", "remote"]);
    const recovered = state.doc;
    state = state.apply(state.tr.insertText("Later edit", 8));
    expect(
      undo(state, (tr) => {
        state = state.apply(tr);
      })
    ).toBe(true);
    expect(state.doc.eq(recovered)).toBe(true);
    expect(undo(state)).toBe(false);
  });

  it("keeps concurrent replies and deduplicates an already received reply", () => {
    const base = withComment(document(), comment("thread"));
    const localReply = reply("local");
    const remoteReply = reply("remote");
    const state = EditorState.create({ doc: withReplies(base, [localReply]) });
    const latest = withReplies(base, [localReply, remoteReply]);
    const recovery = recoverCommentAdditions(state, base, latest);
    expect(recovery && getDocumentComments(recovery.doc)[0].replies).toEqual([
      localReply,
      remoteReply,
    ]);
  });

  it.each([
    "text",
    "formatting",
    "anchor",
    "resolved",
    "deleted",
  ] as const)("rejects a latest snapshot with changed %s", (change) => {
    const base = withComment(document(), comment("thread"));
    const local = withReplies(base, [reply("local")]);
    const tr = new Transform(base);
    switch (change) {
      case "text":
        tr.insert(1, schema.text("Remote edit"));
        break;
      case "formatting":
        tr.addMark(1, 5, schema.marks.bold.create());
        break;
      case "anchor":
        tr.removeMark(1, 3, schema.marks.comment);
        break;
      case "resolved":
        tr.setDocAttribute("comments", [
          { ...comment("thread"), resolved: true },
        ]);
        break;
      case "deleted":
        tr.setDocAttribute("comments", []).removeMark(
          0,
          tr.doc.content.size,
          schema.marks.comment
        );
        break;
    }
    expect(
      recoverCommentAdditions(EditorState.create({ doc: local }), base, tr.doc)
    ).toBeNull();
  });

  it.each([
    "payload",
    "anchor",
  ] as const)("rejects a reused comment id with a different %s", (difference) => {
    const base = document();
    const local = withComment(base, comment("shared"));
    const latest = withComment(
      base,
      {
        ...comment("shared"),
        body:
          difference === "payload"
            ? "A different comment"
            : comment("shared").body,
      },
      difference === "anchor" ? 3 : 1
    );
    expect(
      recoverCommentAdditions(EditorState.create({ doc: local }), base, latest)
    ).toBeNull();
  });

  it.each([
    "resolve",
    "delete",
  ] as const)("does not replay a local %s over a remote reply", (action) => {
    const base = withComment(document(), comment("thread"));
    const latest = withReplies(base, [reply("remote")]);
    const local = new Transform(base);
    if (action === "resolve") {
      local.setDocAttribute("comments", [
        { ...comment("thread"), resolved: true },
      ]);
    } else {
      local
        .setDocAttribute("comments", [])
        .removeMark(0, local.doc.content.size, schema.marks.comment);
    }
    expect(
      recoverCommentAdditions(
        EditorState.create({ doc: local.doc }),
        base,
        latest
      )
    ).toBeNull();
  });
});
