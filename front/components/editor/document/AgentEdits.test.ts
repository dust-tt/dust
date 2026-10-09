// @vitest-environment node
import type { EditHunk } from "@app/components/editor/document/AgentEdits";
import {
  agentEditsPlugin,
  withPlayedEdit,
} from "@app/components/editor/document/AgentEdits";
import {
  documentSchema,
  parseDocumentContent,
} from "@app/components/editor/document/content";
import { LiveAgentFactory } from "@app/tests/utils/LiveAgentFactory";
import type { Node } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AGENT = LiveAgentFactory.build();

function doc(markdown: string): Node {
  const parsed = parseDocumentContent(markdown);
  if (parsed.isErr()) {
    throw new Error(parsed.error);
  }
  return documentSchema.nodeFromJSON(parsed.value.document);
}

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

  /** `changed`, the document after the agent's change, then that change played back. */
  const playedBack = (changed: EditorState, hunks: EditHunk[]) =>
    changed.apply(
      withPlayedEdit(changed, { agent: AGENT, hunks, doc: changed.doc })
    );

  /** The agent typing `text` at `at`, played back. */
  const agentInsert = (state: EditorState, text: string, at: number) =>
    playedBack(state.apply(state.tr.insertText(text, at)), [
      { inserted: [{ from: at, to: at + text.length }], at, removed: "" },
    ]);

  /** The agent replacing the one paragraph's text with `text`, played back. */
  const agentRewrite = (state: EditorState, text: string) => {
    const removed = state.doc.textContent;
    return playedBack(
      state.apply(state.tr.insertText(text, 1, 1 + removed.length)),
      [
        { inserted: [], at: 1, removed },
        { inserted: [{ from: 1, to: 1 + text.length }], at: 1, removed: "" },
      ]
    );
  };

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
      revealed: text("shown") + text("settling"),
      count: found.length,
    };
  }

  const editAsAgent = (state: EditorState) => agentInsert(state, " Indeed.", 7);

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

  it("leaves the highlight's fade to CSS once typed, drawing the same decorations", () => {
    const state = editAsAgent(start("Hello."));
    vi.advanceTimersByTime(400);
    const drawn = () => {
      const decorations = plugin.props.decorations?.call(plugin, state);
      return decorations instanceof DecorationSet
        ? decorations
            .find()
            .map(({ from, to, spec }) => ({ from, to, kind: spec.agentEdit }))
        : [];
    };

    const typed = drawn();
    vi.advanceTimersByTime(500);

    expect(typed).toEqual([{ from: 7, to: 15, kind: "settling" }]);
    expect(drawn()).toEqual(typed);
  });

  it("draws a new removed text for a second edit at the same place", () => {
    const removedKeys = (state: EditorState) => {
      const decorations = plugin.props.decorations?.call(plugin, state);
      return decorations instanceof DecorationSet
        ? decorations
            .find()
            .map(({ spec }) => spec.key)
            .filter((key) => key?.startsWith("agent-removed"))
        : [];
    };

    const first = agentRewrite(start("one"), "two");
    vi.advanceTimersByTime(10);
    const second = agentRewrite(first, "six");

    expect(removedKeys(first)).toHaveLength(1);
    expect(removedKeys(second)).toHaveLength(1);
    expect(removedKeys(second)).not.toEqual(removedKeys(first));
  });

  it("shows a large change at once instead of typing it", () => {
    const long = "word ".repeat(500);
    const state = agentInsert(start("Hello."), ` ${long}`, 7);

    expect(shown(state)).toMatchObject({ hidden: "" });
    expect(shown(state).revealed.length).toBeGreaterThan(2_000);
  });

  it("plays back an edit only while its hunks are in the current document", () => {
    const initial = start("Hello.");
    const changed = initial.apply(initial.tr.insertText(" Indeed.", 7));
    const later = changed.apply(changed.tr.insertText("Oh. ", 1));

    const stale = later.apply(
      withPlayedEdit(later, {
        agent: AGENT,
        hunks: [{ inserted: [{ from: 7, to: 15 }], at: 7, removed: "" }],
        doc: changed.doc,
      })
    );

    expect(shown(stale).count).toBe(0);
  });

  it("keeps playing when another editor's change replaces the whole document", () => {
    const state = editAsAgent(start("Hello.\n\nOther."));
    const theirs = doc("Hello. Indeed.\n\nOther, edited.");
    // How the Yjs binding applies any remote change: one step over the whole document.
    const replaced = state.apply(
      state.tr.replaceWith(0, state.doc.content.size, theirs.content)
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
