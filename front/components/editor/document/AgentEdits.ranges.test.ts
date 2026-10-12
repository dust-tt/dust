import {
  agentEditGlow,
  agentEditsPlugin,
  GLOW_MS,
  insertedTextRanges,
} from "@app/components/editor/document/AgentEdits";
import { documentSchema } from "@app/components/editor/document/content";
import { LiveAgentFactory } from "@app/tests/utils/LiveAgentFactory";
import type { LiveIdRange } from "@app/types/collab";
import { EditorState } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import {
  ProsemirrorBinding,
  ySyncPlugin,
  ySyncPluginKey,
} from "@tiptap/y-tiptap";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const SESSION = "session";

/** A body block: a node name, then its text or child blocks, as y-prosemirror stores them. */
type Block = [string, ...(string | Block)[]];

const element = ([name, ...children]: Block): Y.XmlElement => {
  const node = new Y.XmlElement(name);
  node.insert(
    0,
    children.map((child) =>
      typeof child === "string" ? new Y.XmlText(child) : element(child)
    )
  );
  return node;
};

/** The `index`-th text of a body, in document order. */
const textAt = (document: Y.Doc, index: number) => {
  const texts: Y.XmlText[] = [];
  const walk = (type: Y.XmlFragment | Y.XmlElement) =>
    type.toArray().forEach((child) => {
      if (child instanceof Y.XmlText) {
        texts.push(child);
      } else if (child instanceof Y.XmlElement) {
        walk(child);
      }
    });
  walk(document.getXmlFragment("body"));
  const text = texts[index];
  if (!text) {
    throw new Error(`No text ${index}.`);
  }
  return text;
};

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  vi.useRealTimers();
});

/**
 * The collab server's document, and a browser's in sync with it, bound to an editor by y-tiptap.
 */
async function session(blocks: Block[]) {
  const server = new Y.Doc();
  server.getXmlFragment("body").insert(0, blocks.map(element));
  const browser = new Y.Doc();
  Y.applyUpdate(browser, Y.encodeStateAsUpdate(server), SESSION);

  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      schema: documentSchema,
      plugins: [
        ySyncPlugin(browser.getXmlFragment("body")),
        agentEditsPlugin(),
      ],
    }),
  });
  views.push(view);
  // The binding renders the shared document after a timeout.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const binding = ySyncPluginKey.getState(view.state)?.binding;
  if (!(binding instanceof ProsemirrorBinding)) {
    throw new Error("The editor is not bound.");
  }

  /**
   * The agent's `change` on the server, with the ids it inserted as the server announces them, and
   * delivering its update to the browser.
   */
  const fromAgent = (change: () => void) => {
    const before = Y.encodeStateVector(server);
    let inserted: LiveIdRange[] = [];
    const onAfter = (transaction: Y.Transaction) => {
      inserted = [];
      transaction.afterState.forEach((after, client) => {
        const from = transaction.beforeState.get(client) ?? 0;
        if (after > from) {
          inserted.push({ client, clock: from, length: after - from });
        }
      });
    };
    server.on("afterTransaction", onAfter);
    server.transact(change);
    server.off("afterTransaction", onAfter);
    return {
      inserted,
      deliver: () =>
        Y.applyUpdate(browser, Y.encodeStateAsUpdate(server, before), SESSION),
    };
  };

  /** What the browser glows for `inserted`: the text of each range. */
  const glowed = (inserted: LiveIdRange[]) =>
    insertedTextRanges(binding, inserted).map(({ from, to }) =>
      view.state.doc.textBetween(from, to)
    );

  return { server, browser, view, fromAgent, glowed };
}

describe("insertedTextRanges", () => {
  it("glows exactly the text the agent inserted", async () => {
    const { server, fromAgent, glowed } = await session([
      ["paragraph", "One."],
      ["paragraph", "Two."],
    ]);

    const edit = fromAgent(() => {
      textAt(server, 0).delete(0, 3);
      textAt(server, 0).insert(0, "Uno");
    });
    edit.deliver();

    expect(glowed(edit.inserted)).toEqual(["Uno"]);
  });

  it("never glows text someone typed inside the agent's change", async () => {
    const { server, browser, view, fromAgent, glowed } = await session([
      ["paragraph", "cat"],
    ]);
    // Typed here before the server learns of it, inside the text the agent replaces.
    textAt(browser, 0).insert(1, "HUMAN");

    const edit = fromAgent(() => {
      textAt(server, 0).delete(0, 3);
      textAt(server, 0).insert(0, "dog");
    });
    edit.deliver();

    expect(view.state.doc.textContent).toContain("HUMAN");
    expect(glowed(edit.inserted)).toEqual(["dog"]);
  });

  it("glows only the new text when the agent appends to its own earlier text", async () => {
    const { server, fromAgent, glowed } = await session([["paragraph", "A."]]);

    const first = fromAgent(() => textAt(server, 0).insert(2, " Agent one."));
    first.deliver();
    // Merged with the first change's item in both documents.
    const second = fromAgent(() => textAt(server, 0).insert(13, " Agent two."));
    second.deliver();

    expect(glowed(second.inserted)).toEqual([" Agent two."]);
  });

  it("glows nothing before the agent's change reached the document", async () => {
    const { server, fromAgent, glowed } = await session([
      ["paragraph", "One."],
    ]);

    const edit = fromAgent(() => textAt(server, 0).insert(4, " Indeed"));

    expect(glowed(edit.inserted)).toEqual([]);
  });

  it("glows nothing in a paragraph this browser already deleted", async () => {
    const { server, browser, fromAgent, glowed } = await session([
      ["paragraph", "One."],
      ["paragraph", "Two."],
    ]);
    browser.getXmlFragment("body").delete(0, 1);

    const edit = fromAgent(() => textAt(server, 0).insert(4, " Indeed"));
    edit.deliver();

    expect(glowed(edit.inserted)).toEqual([]);
  });

  it("finds the agent's text in a list item and after a hard break", async () => {
    const { server, fromAgent, glowed } = await session([
      ["paragraph", "Intro"],
      ["bulletList", ["listItem", ["paragraph", "one"]]],
      ["paragraph", "before", ["hardBreak"], "after"],
    ]);

    const edit = fromAgent(() => {
      textAt(server, 1).insert(3, " item");
      textAt(server, 3).insert(5, " break");
    });
    edit.deliver();

    expect(glowed(edit.inserted)).toEqual([" item", " break"]);
  });

  it("glows nothing for formatting alone", async () => {
    const { server, fromAgent, glowed } = await session([
      ["paragraph", "One."],
    ]);

    const edit = fromAgent(() => textAt(server, 0).format(0, 3, { bold: {} }));
    edit.deliver();

    expect(glowed(edit.inserted)).toEqual([]);
  });

  it("glows the agent's text in the editor when announced, then removes it after the fade", async () => {
    const { server, view, fromAgent } = await session([["paragraph", "One."]]);
    const edit = fromAgent(() => textAt(server, 0).insert(4, " Indeed"));
    edit.deliver();
    vi.useFakeTimers();

    const glow = agentEditGlow(view.state, {
      type: "agent_edit",
      agent: LiveAgentFactory.build(),
      inserted: edit.inserted,
    });
    if (glow) {
      view.dispatch(glow);
    }
    const glowing = () =>
      [...view.dom.querySelectorAll(".animate-agent-edit-settle")].map(
        (node) => node.textContent
      );

    expect(glowing()).toEqual([" Indeed"]);
    vi.advanceTimersByTime(GLOW_MS);
    expect(glowing()).toEqual([]);
  });
});
