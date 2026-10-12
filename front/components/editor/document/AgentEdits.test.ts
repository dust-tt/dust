// @vitest-environment node
import {
  agentEditsPlugin,
  withAgentEditGlow,
} from "@app/components/editor/document/AgentEdits";
import {
  documentSchema,
  parseDocumentContent,
} from "@app/components/editor/document/content";
import { LiveAgentFactory } from "@app/tests/utils/LiveAgentFactory";
import type { Node } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";
import { describe, expect, it } from "vitest";

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

  const start = (markdown: string) =>
    EditorState.create({ doc: doc(markdown), plugins: [plugin] });

  /** The text each glow covers. */
  const glowing = (state: EditorState) => {
    const decorations = plugin.props.decorations?.call(plugin, state);
    return decorations instanceof DecorationSet
      ? decorations
          .find()
          .filter(({ spec }) => spec.agentEdit === "glow")
          .map(({ from, to }) => state.doc.textBetween(from, to))
      : [];
  };

  /** "Hello." then the agent's " Indeed.", glowing. */
  const agentEdit = () => {
    const initial = start("Hello.");
    const changed = initial.apply(initial.tr.insertText(" Indeed.", 7));
    return changed.apply(
      withAgentEditGlow(changed, {
        agent: AGENT,
        ranges: [{ from: 7, to: 15 }],
        doc: changed.doc,
      })
    );
  };

  it("glows the agent's text, the same decorations while the CSS fades it", () => {
    const state = agentEdit();

    expect(glowing(state)).toEqual([" Indeed."]);
    // A transaction that changes nothing, such as a selection: the glow stays as it is.
    expect(glowing(state.apply(state.tr))).toEqual([" Indeed."]);
  });

  it("ends at once on any later change of the document", () => {
    const state = agentEdit();

    expect(glowing(state.apply(state.tr.insertText("Oh. ", 1)))).toEqual([]);
  });

  it("ignores ranges of a document that is no longer the current one", () => {
    const initial = start("Hello.");
    const changed = initial.apply(initial.tr.insertText(" Indeed.", 7));
    const later = changed.apply(changed.tr.insertText("Oh. ", 1));

    const stale = later.apply(
      withAgentEditGlow(later, {
        agent: AGENT,
        ranges: [{ from: 7, to: 15 }],
        doc: changed.doc,
      })
    );

    expect(glowing(stale)).toEqual([]);
  });
});
