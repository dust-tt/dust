// @vitest-environment node
import {
  agentEditsPlugin,
  announceAgentActivity,
  diffAgentEdit,
} from "@app/components/editor/document/AgentEdits";
import {
  documentSchema,
  parseDocumentContent,
} from "@app/components/editor/document/content";
import type { Node } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { EditorState } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AGENT = { agentId: "agt_1", name: "Writer" };

function doc(markdown: string): Node {
  const parsed = parseDocumentContent(markdown);
  if (parsed.isErr()) {
    throw new Error(parsed.error);
  }
  return documentSchema.nodeFromJSON(parsed.value.document);
}

const insertedText = (
  after: Node,
  hunk: { inserted: { from: number; to: number }[] }
) => hunk.inserted.map(({ from, to }) => after.textBetween(from, to)).join("");

describe("diffAgentEdit", () => {
  it("narrows a change inside a paragraph to the characters that differ", () => {
    const after = doc("Hello bold world.");
    const hunks = diffAgentEdit(doc("Hello brave world."), after);

    expect(hunks).toHaveLength(1);
    expect(hunks[0].removed).toBe("rave");
    expect(insertedText(after, hunks[0])).toBe("old");
  });

  it("keeps separate changes apart, in document order", () => {
    const after = doc("One changed.\n\nTwo.\n\nThree changed.");
    const hunks = diffAgentEdit(doc("One.\n\nTwo.\n\nThree."), after);

    expect(hunks.map((hunk) => insertedText(after, hunk))).toEqual([
      " changed",
      " changed",
    ]);
  });

  it("covers new blocks and removed text", () => {
    const added = doc("Intro.\n\nA new paragraph.");
    expect(
      diffAgentEdit(doc("Intro."), added).map((hunk) => ({
        removed: hunk.removed,
        inserted: insertedText(added, hunk),
      }))
    ).toEqual([{ removed: "", inserted: "A new paragraph." }]);

    const removed = doc("Intro.");
    expect(
      diffAgentEdit(doc("Intro.\n\nGone soon."), removed).map((hunk) => ({
        removed: hunk.removed,
        inserted: insertedText(removed, hunk),
      }))
    ).toEqual([{ removed: "Gone soon.", inserted: "" }]);
  });

  it("keeps a change of whitespace inside text", () => {
    const after = doc("hello world");
    expect(
      diffAgentEdit(doc("helloworld"), after).map((hunk) =>
        insertedText(after, hunk)
      )
    ).toEqual([" "]);
  });

  it("plays a rewrite of many blocks as one hunk instead of diffing every block", () => {
    // Built from the schema: parsing this much Markdown is slower than the diff under test.
    const paragraphs = (word: string) =>
      documentSchema.node(
        "doc",
        null,
        Array.from({ length: 5_000 }, (_, i) =>
          documentSchema.node("paragraph", null, [
            documentSchema.text(`${word} ${i}.`),
          ])
        )
      );
    const after = paragraphs("New");

    const started = performance.now();
    const hunks = diffAgentEdit(paragraphs("Old"), after);

    // Diffing every block takes seconds here; the bounded diff takes milliseconds.
    expect(performance.now() - started).toBeLessThan(500);
    expect(hunks).toHaveLength(1);
    expect(insertedText(after, hunks[0]).startsWith("New 0.")).toBe(true);
  });

  it("makes no hunk for a change of marks alone", () => {
    expect(diffAgentEdit(doc("Hello world."), doc("Hello **world**."))).toEqual(
      []
    );
  });
});

describe("agentEditsPlugin", () => {
  const plugin = agentEditsPlugin();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const start = (markdown: string) =>
    EditorState.create({ doc: doc(markdown), plugins: [plugin] });

  const remote = (transaction: Transaction) =>
    transaction.setMeta(ySyncPluginKey, { isChangeOrigin: true });

  /** The text each decoration kind covers at the current time. */
  function shown(state: EditorState) {
    const decorations = plugin.props.decorations?.call(plugin, state);
    const found =
      decorations instanceof DecorationSet ? decorations.find() : [];
    const text = (kind: string) =>
      found
        .filter((decoration) => decoration.spec.agentEdit === kind)
        .map(({ from, to }) => state.doc.textBetween(from, to))
        .join("");
    return {
      hidden: text("hidden"),
      revealed: text("shown"),
      count: found.length,
    };
  }

  function editAsAgent(state: EditorState) {
    const announced = state.apply(
      announceAgentActivity(state.tr, { agent: AGENT, activity: "editing" })
    );
    return announced.apply(remote(announced.tr.insertText(" Indeed.", 7)));
  }

  it("reveals the agent's new text over time, then settles", () => {
    const state = editAsAgent(start("Hello."));
    expect(state.doc.textContent).toBe("Hello. Indeed.");
    expect(shown(state).hidden).toBe(" Indeed.");

    vi.advanceTimersByTime(30);
    const midway = shown(state);
    expect(midway.revealed.length).toBeGreaterThan(0);
    expect(midway.revealed + midway.hidden).toBe(" Indeed.");

    vi.advanceTimersByTime(300);
    expect(shown(state)).toMatchObject({ hidden: "", revealed: " Indeed." });

    vi.advanceTimersByTime(5_000);
    const settled = state.apply(state.tr);
    expect(shown(settled).count).toBe(0);
  });

  it("plays back nothing without an announcement, or once it expired", () => {
    const plain = start("Hello.");
    expect(
      shown(plain.apply(remote(plain.tr.insertText(" Indeed.", 7)))).count
    ).toBe(0);

    const announced = plain.apply(
      announceAgentActivity(plain.tr, { agent: AGENT, activity: "editing" })
    );
    vi.advanceTimersByTime(10_000);
    expect(
      shown(announced.apply(remote(announced.tr.insertText(" Indeed.", 7))))
        .count
    ).toBe(0);
  });

  it("plays back neither the local user's change, nor undo, nor a reading agent's", () => {
    const announced = start("Hello.").apply(
      announceAgentActivity(start("Hello.").tr, {
        agent: AGENT,
        activity: "editing",
      })
    );
    expect(
      shown(announced.apply(announced.tr.insertText(" Mine.", 7))).count
    ).toBe(0);
    expect(
      shown(
        announced.apply(
          announced.tr.insertText(" Undone.", 7).setMeta(ySyncPluginKey, {
            isChangeOrigin: true,
            isUndoRedoOperation: true,
          })
        )
      ).count
    ).toBe(0);

    const cancelled = announced.apply(
      announceAgentActivity(announced.tr, { agent: AGENT, activity: "reading" })
    );
    expect(
      shown(cancelled.apply(remote(cancelled.tr.insertText(" Later.", 7))))
        .count
    ).toBe(0);
  });

  it("keeps playing when another editor's change replaces the whole document", () => {
    const state = editAsAgent(start("Hello.\n\nOther."));
    const theirs = doc("Hello. Indeed.\n\nOther, edited.");
    // How the Yjs binding applies any remote change: one step over the whole document.
    const replaced = state.apply(
      remote(state.tr.replaceWith(0, state.doc.content.size, theirs.content))
    );

    expect(replaced.doc.textContent).toBe("Hello. Indeed.Other, edited.");
    expect(shown(replaced).hidden).toBe(" Indeed.");
  });

  it("ends playback, showing everything, when someone types inside the agent's text", () => {
    const state = editAsAgent(start("Hello."));
    // Inside " Indeed.", which starts at 7.
    const typed = state.apply(state.tr.insertText("MINE", 10));

    expect(typed.doc.textContent).toBe("Hello. InMINEdeed.");
    expect(shown(typed)).toMatchObject({ hidden: "", count: 0 });
  });

  it("follows the text when the document changes during playback", () => {
    const state = editAsAgent(start("Hello."));
    const moved = state.apply(state.tr.insertText("Oh. ", 1));

    expect(moved.doc.textContent).toBe("Oh. Hello. Indeed.");
    expect(shown(moved).hidden).toBe(" Indeed.");
  });
});
