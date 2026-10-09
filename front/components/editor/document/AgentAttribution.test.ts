import {
  attributionHunks,
  followAttributions,
} from "@app/components/editor/document/AgentAttribution";
import type {
  PlayedEdit,
  RemappedHunks,
} from "@app/components/editor/document/AgentEdits";
import { documentSchema } from "@app/components/editor/document/content";
import { attributeTransaction } from "@app/lib/live_attribution";
import type { LiveAttributionMessage } from "@app/types/collab";
import { EditorState } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import {
  ProsemirrorBinding,
  ySyncPlugin,
  ySyncPluginKey,
} from "@tiptap/y-tiptap";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

const SESSION = "session";
const AUTHOR = { kind: "agent", agentId: "agt_1", name: "Writer" } as const;

const paragraphText = (document: Y.Doc, index: number) => {
  const paragraph = document.getXmlFragment("body").get(index);
  const text = paragraph instanceof Y.XmlElement ? paragraph.get(0) : null;
  if (!(text instanceof Y.XmlText)) {
    throw new Error(`No paragraph ${index}.`);
  }
  return text;
};

/** What a played edit shows: the text it types and the text it fades out. */
const shownText = ({ hunks, doc }: PlayedEdit) => ({
  inserted: hunks
    .flatMap(({ inserted }) =>
      inserted.map(({ from, to }) => doc.textBetween(from, to))
    )
    .join(""),
  removed: hunks.map(({ removed }) => removed).filter((text) => text !== ""),
});

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
});

/**
 * The collab server's document, another editor's and a browser's, all in sync, the browser's
 * bound to an editor that follows attributions as the live editor does.
 */
async function session(paragraphs: string[]) {
  const server = new Y.Doc();
  server.getXmlFragment("body").insert(
    0,
    paragraphs.map((text) => {
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [new Y.XmlText(text)]);
      return paragraph;
    })
  );
  const browser = new Y.Doc();
  Y.applyUpdate(browser, Y.encodeStateAsUpdate(server), SESSION);
  const collaborator = new Y.Doc();
  Y.applyUpdate(collaborator, Y.encodeStateAsUpdate(server));

  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      schema: documentSchema,
      plugins: [ySyncPlugin(browser.getXmlFragment("body"))],
    }),
  });
  views.push(view);
  // The binding renders the shared document after a timeout.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const binding = ySyncPluginKey.getState(view.state)?.binding;
  if (!(binding instanceof ProsemirrorBinding)) {
    throw new Error("The editor is not bound.");
  }

  let send: (attribution: LiveAttributionMessage) => void = () => {};
  const played: PlayedEdit[] = [];
  const remaps: RemappedHunks[] = [];
  followAttributions(
    {
      document: browser,
      isSessionOrigin: (origin) => origin === SESSION,
      onAttribution: (listener) => {
        send = listener;
        return () => {};
      },
    },
    {
      doc: () => view.state.doc,
      hunks: (attribution, applied) =>
        attributionHunks(binding, attribution, applied),
      isPlaying: () => played.length > 0,
      play: (edit) => played.push(edit),
      remap: (remapped) => remaps.push(remapped),
    }
  );

  /** The agent's `change` on the server, attributed as the server does; delivering it is left. */
  const fromAgent = (change: () => void) => {
    const before = Y.encodeStateVector(server);
    const body = server.getXmlFragment("body");
    const onChange = (_events: unknown, transaction: Y.Transaction) => {
      const attribution = attributeTransaction(transaction, AUTHOR, 0);
      if (attribution) {
        send(attribution);
      }
    };
    body.observeDeep(onChange);
    server.transact(change);
    body.unobserveDeep(onChange);
    return () =>
      Y.applyUpdate(browser, Y.encodeStateAsUpdate(server, before), SESSION);
  };

  /** A change of the server's own, not attributed, such as front matter; delivering it is left. */
  const fromServer = (change: () => void) => {
    const before = Y.encodeStateVector(server);
    server.transact(change);
    return () =>
      Y.applyUpdate(browser, Y.encodeStateAsUpdate(server, before), SESSION);
  };

  /** Another editor's `change`, relayed by the session; delivering it is left. */
  const fromCollaborator = (change: (document: Y.Doc) => void) => {
    const before = Y.encodeStateVector(collaborator);
    change(collaborator);
    return () =>
      Y.applyUpdate(
        browser,
        Y.encodeStateAsUpdate(collaborator, before),
        SESSION
      );
  };

  /** Lets queued playbacks run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  return {
    server,
    browser,
    view,
    played,
    remaps,
    fromAgent,
    fromServer,
    fromCollaborator,
    settle,
  };
}

describe("attributed agent edits", () => {
  it("plays back exactly the text the agent wrote and removed", async () => {
    const { server, played, fromAgent, settle } = await session([
      "One.",
      "Two.",
    ]);

    fromAgent(() => {
      paragraphText(server, 0).delete(0, 3);
      paragraphText(server, 0).insert(0, "Uno");
    })();
    await settle();

    expect(played).toHaveLength(1);
    expect(shownText(played[0])).toEqual({ inserted: "Uno", removed: ["One"] });
  });

  it("never shows another editor's text as the agent's, even inside the agent's change", async () => {
    const { server, browser, view, played, fromAgent, settle } = await session([
      "cat",
    ]);
    // Typed here before the server learns of it, inside the text the agent replaces.
    paragraphText(browser, 0).insert(1, "HUMAN");

    fromAgent(() => {
      paragraphText(server, 0).delete(0, 3);
      paragraphText(server, 0).insert(0, "dog");
    })();
    await settle();

    expect(view.state.doc.textContent).toContain("HUMAN");
    expect(played).toHaveLength(1);
    expect(shownText(played[0])).toEqual({ inserted: "dog", removed: ["cat"] });
  });

  it("plays back a deleted paragraph's whole text where it stood", async () => {
    const { server, played, fromAgent, settle } = await session([
      "One.",
      "Two.",
      "Three.",
    ]);

    fromAgent(() => server.getXmlFragment("body").delete(1, 1))();
    await settle();

    // Between "One." and "Three.", where the paragraph stood.
    expect(played.map(({ hunks }) => hunks)).toEqual([
      [{ inserted: [], at: 6, removed: "Two." }],
    ]);
  });

  it("never takes another editor's change for the agent's, whatever the order", async () => {
    const { server, played, fromAgent, fromCollaborator, settle } =
      await session(["One.", "Two."]);

    // Attributed, but its update is still on the way when another editor's arrives.
    const agentChange = fromAgent(() =>
      paragraphText(server, 0).insert(4, " Indeed")
    );
    fromCollaborator((document) =>
      paragraphText(document, 1).insert(4, " Human")
    )();
    await settle();
    expect(played).toEqual([]);

    agentChange();
    await settle();
    expect(played.map(shownText)).toEqual([
      { inserted: " Indeed", removed: [] },
    ]);
  });

  it("plays back nothing when the agent wrote in text this browser already deleted", async () => {
    const { server, browser, played, fromAgent, fromCollaborator, settle } =
      await session(["One.", "Two."]);
    // Deleted here, before the server learns of it.
    browser.getXmlFragment("body").delete(0, 1);

    fromAgent(() => paragraphText(server, 0).insert(4, " Indeed"))();
    await settle();
    fromCollaborator((document) =>
      paragraphText(document, 1).insert(4, " Human")
    )();
    await settle();

    expect(played).toEqual([]);
  });

  it("plays back nothing when the agent deleted what this browser already deleted", async () => {
    const { server, browser, played, fromAgent, fromCollaborator, settle } =
      await session(["One.", "Two."]);
    browser.getXmlFragment("body").delete(0, 1);

    fromAgent(() => server.getXmlFragment("body").delete(0, 1))();
    await settle();
    fromCollaborator((document) =>
      paragraphText(document, 1).insert(4, " Human")
    )();
    await settle();

    expect(played).toEqual([]);
  });

  it("plays back each part of a change Yjs applies in two transactions", async () => {
    const { server, played, fromAgent, fromServer, settle } = await session([
      "cat",
    ]);
    // Withheld: the agent's new text depends on it, so Yjs holds that text until it arrives.
    const metadata = fromServer(() =>
      server.getMap("envelope").set("title", "Pets")
    );

    fromAgent(() => {
      paragraphText(server, 0).delete(0, 3);
      paragraphText(server, 0).insert(0, "dog");
    })();
    await settle();
    metadata();
    await settle();

    expect(played.map(shownText)).toEqual([
      { inserted: "", removed: ["cat"] },
      { inserted: "dog", removed: [] },
    ]);
  });

  it("follows the agent's text exactly while it plays, even next to the same text", async () => {
    const {
      server,
      browser,
      played,
      remaps,
      fromAgent,
      fromCollaborator,
      settle,
    } = await session(["a"]);
    const agentItem = {
      client: server.clientID,
      clock: Y.getState(server.store, server.clientID),
    };

    fromAgent(() => paragraphText(server, 0).insert(0, "a"))();
    await settle();
    // Another editor types the same letter at the same place while it plays: which "a" comes first
    // depends on the two clients' ids, and only the agent's item tells them apart.
    fromCollaborator((document) => paragraphText(document, 0).insert(0, "a"))();
    await settle();

    const agentIndex = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON({ item: agentItem }),
      browser
    )?.index;
    expect(played).toHaveLength(1);
    expect(remaps.at(-1)?.doc.textContent).toBe("aaa");
    expect(remaps.at(-1)?.hunks).toEqual([
      {
        inserted: [
          { from: 1 + (agentIndex ?? -1), to: 2 + (agentIndex ?? -1) },
        ],
        at: 1 + (agentIndex ?? -1),
        removed: "",
      },
    ]);
  });

  it("plays back nothing for formatting alone, nor for the browser's own changes", async () => {
    const { server, browser, played, fromAgent, settle } = await session([
      "One.",
    ]);

    fromAgent(() => paragraphText(server, 0).format(0, 3, { bold: {} }))();
    paragraphText(browser, 0).insert(4, " Mine");
    await settle();

    expect(played).toEqual([]);
  });
});
