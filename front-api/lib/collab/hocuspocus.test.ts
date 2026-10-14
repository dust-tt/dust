import { createServer } from "node:http";
import type { CollabAccess } from "@app/lib/api/collab/access";
import { checkCollabAccess } from "@app/lib/api/collab/access";
import {
  applyCommentRequest,
  dispatchSessionCommentMentions,
} from "@app/lib/api/collab/comments";
import {
  loadCollabSession,
  saveCollabSession,
} from "@app/lib/api/collab/session_file";
import { mintCollabTicket } from "@app/lib/api/collab/tickets";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { Authenticator } from "@app/lib/auth";
import { onAgentActivity, onAgentEdit } from "@app/lib/client/collab/agents";
import type { CommentChannel } from "@app/lib/client/collab/comments";
import { createCommentChannel } from "@app/lib/client/collab/comments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { CollabAgentFactory } from "@app/tests/utils/CollabAgentFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import type { AgentEditMessage, InsertedIdRange } from "@app/types/collab";
import { toSessionName } from "@app/types/collab";
import { COLLAB_SOURCE_WRITE_WAIT_MS } from "@app/types/collab_internal";
import { Err, Ok } from "@app/types/shared/result";
import {
  saveNextRevision,
  COMMENTS,
  collabAccess,
  DOCUMENT_NAME,
  loadSource,
  SOURCE,
  typeInto,
} from "@front-api/lib/collab/collab.test_utils";
import {
  saveAllSessions,
  createCollabHocuspocus,
  UNLOAD_GRACE_PERIOD_MS,
} from "@front-api/lib/collab/hocuspocus";
import {
  readSessionSource,
  showAgentActivity,
  writeSessionSource,
} from "@front-api/lib/collab/session";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { WebSocketLike } from "@hocuspocus/server";
import type { Peer } from "crossws";
import crossws from "crossws/adapters/node";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

vi.mock("@app/lib/api/collab/access", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/collab/access")>();
  return {
    ...actual,
    // Real until a test stubs it: minting a ticket and connecting both check access.
    checkCollabAccess: vi.fn(actual.checkCollabAccess),
  };
});

vi.mock("@app/lib/api/collab/session_file", () => ({
  loadCollabSession: vi.fn(),
  saveCollabSession: vi.fn(),
}));

vi.mock("@app/lib/api/collab/comments", () => ({
  applyCommentRequest: vi.fn(),
  dispatchSessionCommentMentions: vi.fn(async () => undefined),
}));

describe("createCollabHocuspocus", () => {
  beforeEach(() => {
    vi.mocked(loadCollabSession).mockImplementation(loadSource);
    saveNextRevision();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves each edit with the loaded threads, after the last revision written", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await collabAccess(true);
    // Faked once the database is set up, which needs real timers.
    vi.useFakeTimers();

    for (const text of ["First.", "Second."]) {
      const connection = await hocuspocus.openDirectConnection(
        DOCUMENT_NAME,
        writer
      );
      await connection.transact((doc) => typeInto(doc, text));
      await connection.disconnect();
    }

    const calls = vi.mocked(saveCollabSession).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(writer);
    expect(calls[0][1].comments).toBe(COMMENTS);
    expect(calls.map(([, , last]) => last.revision)).toEqual(["1", "2"]);
    expect(loadCollabSession).toHaveBeenCalledTimes(1);
  });

  it("saves every document at once on shutdown, edits waiting for their store included", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await collabAccess(true);
    vi.useFakeTimers();

    const edited = await hocuspocus.openDirectConnection(DOCUMENT_NAME, writer);
    await edited.transact((doc) => typeInto(doc, "Not stored yet."));
    await hocuspocus.openDirectConnection("w1:user-u1/untouched.md", writer);
    expect(saveCollabSession).not.toHaveBeenCalled();

    await saveAllSessions(hocuspocus);

    expect(saveCollabSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveCollabSession).mock.calls[0][0]).toBe(writer);
    // The debounced store it replaced does not run again.
    await vi.advanceTimersByTimeAsync(hocuspocus.configuration.maxDebounce);
    expect(saveCollabSession).toHaveBeenCalledTimes(1);
  });

  it("waits on shutdown for a document still loading", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await collabAccess(true);
    let finishLoad = () => {};
    vi.mocked(loadCollabSession).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finishLoad = resolve;
      });
      return loadSource();
    });

    const opening = hocuspocus.openDirectConnection(DOCUMENT_NAME, writer);
    let saved = false;
    const shutdown = saveAllSessions(hocuspocus).then(() => {
      saved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(saved).toBe(false);

    finishLoad();
    await opening;
    await shutdown;
    expect(saved).toBe(true);
  });

  it("keeps a document for the grace period, then reads the file again", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await collabAccess(true);
    vi.useFakeTimers();

    const connection = await hocuspocus.openDirectConnection(
      DOCUMENT_NAME,
      writer
    );
    await connection.transact((doc) => typeInto(doc, "Edit."));
    await connection.disconnect();

    await vi.advanceTimersByTimeAsync(UNLOAD_GRACE_PERIOD_MS - 1);
    expect(hocuspocus.getDocumentsCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(hocuspocus.getDocumentsCount()).toBe(0);

    const reopened = await hocuspocus.openDirectConnection(
      DOCUMENT_NAME,
      writer
    );
    expect(loadCollabSession).toHaveBeenCalledTimes(2);
    await reopened.disconnect();
  });

  it("keeps a document a client came back to during the grace period", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await collabAccess(true);
    vi.useFakeTimers();

    const first = await hocuspocus.openDirectConnection(DOCUMENT_NAME, writer);
    await first.transact((doc) => typeInto(doc, "Edit."));
    await first.disconnect();

    await vi.advanceTimersByTimeAsync(UNLOAD_GRACE_PERIOD_MS - 1);
    const second = await hocuspocus.openDirectConnection(DOCUMENT_NAME, writer);
    await vi.advanceTimersByTimeAsync(UNLOAD_GRACE_PERIOD_MS);
    expect(hocuspocus.getDocumentsCount()).toBe(1);

    await second.disconnect();
    await vi.advanceTimersByTimeAsync(UNLOAD_GRACE_PERIOD_MS - 1);
    expect(hocuspocus.getDocumentsCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(hocuspocus.getDocumentsCount()).toBe(0);
    expect(loadCollabSession).toHaveBeenCalledTimes(1);
  });

  it("keeps a document whose save failed after the grace period", async () => {
    vi.mocked(saveCollabSession).mockResolvedValue(
      new Err("This file changed since it was loaded.")
    );
    const hocuspocus = createCollabHocuspocus();
    const writer = await collabAccess(true);
    vi.useFakeTimers();

    const connection = await hocuspocus.openDirectConnection(
      DOCUMENT_NAME,
      writer
    );
    await connection.transact((doc) => typeInto(doc, "Edit."));
    await connection.disconnect();

    await vi.advanceTimersByTimeAsync(UNLOAD_GRACE_PERIOD_MS);
    expect(hocuspocus.getDocumentsCount()).toBe(1);
  });

  it("saves through the last writer when a reader disconnects", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await collabAccess(true);
    const reader = await collabAccess(false);
    vi.useFakeTimers();

    const writing = await hocuspocus.openDirectConnection(
      DOCUMENT_NAME,
      writer
    );
    await writing.transact((doc) => typeInto(doc, "Edit."));
    const reading = await hocuspocus.openDirectConnection(
      DOCUMENT_NAME,
      reader
    );
    await reading.disconnect();
    expect(saveCollabSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveCollabSession).mock.calls[0][0]).toBe(writer);

    await writing.disconnect();
    await vi.advanceTimersByTimeAsync(UNLOAD_GRACE_PERIOD_MS);
    expect(hocuspocus.getDocumentsCount()).toBe(0);
  });

  it("refuses to save an edit made without write access", async () => {
    const hocuspocus = createCollabHocuspocus();
    const reader = await collabAccess(false);
    vi.useFakeTimers();

    const connection = await hocuspocus.openDirectConnection(
      DOCUMENT_NAME,
      reader
    );
    await connection.transact((doc) => typeInto(doc, "Edit."));
    await connection.disconnect();

    expect(saveCollabSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UNLOAD_GRACE_PERIOD_MS);
    expect(hocuspocus.getDocumentsCount()).toBe(1);
  });
});

async function ticketFor(auth: Authenticator, path: string) {
  const ticket = await mintCollabTicket(auth, path);
  if (ticket.isErr()) {
    throw new Error(ticket.error.message);
  }
  return ticket.value;
}

function isWebSocketLike(socket: unknown): socket is WebSocketLike {
  return typeof socket === "object" && socket !== null && "send" in socket;
}

/** Serves the Hocuspocus instance over WebSockets, as the collab server does. */
async function serve(hocuspocus: ReturnType<typeof createCollabHocuspocus>) {
  const connections = new WeakMap<
    Peer,
    ReturnType<typeof hocuspocus.handleConnection>
  >();
  const ws = crossws({
    hooks: {
      open(peer) {
        if (isWebSocketLike(peer.websocket)) {
          connections.set(
            peer,
            hocuspocus.handleConnection(peer.websocket, peer.request)
          );
        }
      },
      message(peer, message) {
        connections.get(peer)?.handleMessage(message.uint8Array());
      },
      close(peer, event) {
        connections.get(peer)?.handleClose({
          code: event.code ?? 1005,
          reason: event.reason ?? "",
        });
      },
    },
  });
  const server = createServer();
  server.on("upgrade", (request, socket, head) =>
    ws.handleUpgrade(request, socket, head)
  );
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The test server has no port.");
  }
  return {
    url: `ws://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
}

// TODO(co-edition): cover commands applied one at a time per document, a message that is not a
// client message, a command whose document unloads before it finishes, and a command that times
// out.
describe("comment threads in a live session", () => {
  const THREAD: DfmComment = {
    id: "c1",
    status: "open",
    messages: [
      {
        author: { kind: "user", id: "usr_tom", name: "Tom" },
        createdAt: "2026-10-05T12:00:00.000Z",
        body: "Why Friday?",
      },
    ],
  };
  const CREATED: DfmComment = { ...THREAD, id: "c2" };
  const providers: HocuspocusProvider[] = [];
  const channels: CommentChannel[] = [];
  let close: () => void = () => undefined;

  beforeEach(() => {
    saveNextRevision();
    vi.mocked(dispatchSessionCommentMentions).mockClear();
  });

  afterEach(() => {
    channels.forEach((channel) => channel.close());
    providers.forEach((provider) => provider.destroy());
    close();
    vi.restoreAllMocks();
    vi.mocked(checkCollabAccess).mockReset();
  });

  // The socket handlers run outside the test's database transaction: authentication and the
  // commands, tested on their own, are stubbed.
  async function start() {
    const writer = await collabAccess(true);
    await FeatureFlagFactory.basic(writer.auth, "co_edition");
    vi.spyOn(Authenticator, "fromUserIdAndWorkspaceId").mockResolvedValue(
      writer.auth
    );
    vi.mocked(checkCollabAccess).mockResolvedValue(new Ok(writer));
    vi.mocked(loadCollabSession).mockImplementation(async () => {
      const live = dfmToYDoc(SOURCE);
      if (live.isErr()) {
        throw new Error(live.error);
      }
      return new Ok({
        content: { doc: live.value.doc, comments: [THREAD] },
        lastSave: { revision: "1", source: "" },
      });
    });
    vi.mocked(applyCommentRequest).mockImplementation(
      async (_file, comments, command) =>
        command.type === "add"
          ? new Ok({
              comments: [...comments, CREATED],
              created: CREATED,
              added: CREATED.messages[0],
            })
          : new Err("thread_changed")
    );
    const hocuspocus = createCollabHocuspocus();
    const server = await serve(hocuspocus);
    close = server.close;
    return { writer, hocuspocus, url: server.url };
  }

  async function join(url: string, writer: CollabAccess) {
    // Each connection redeems a ticket of its own, a reconnection included.
    const tickets = [
      await ticketFor(writer.auth, writer.canonicalPath),
      await ticketFor(writer.auth, writer.canonicalPath),
    ];
    const provider = new HocuspocusProvider({
      url,
      name: `${writer.workspaceId}:${writer.canonicalPath}`,
      token: () => tickets.shift() ?? "",
      document: new Y.Doc(),
    });
    providers.push(provider);
    await new Promise<void>((resolve) => provider.on("synced", resolve));
    const channel = createCommentChannel(provider, null);
    channels.push(channel);
    await vi.waitFor(() => expect(channel.getThreads()).not.toBeNull());
    return { channel, provider };
  }

  it("serves the threads, applies a command for every connection and saves it", async () => {
    const { writer, hocuspocus, url } = await start();
    const { channel: mine } = await join(url, writer);
    const { channel: theirs } = await join(url, writer);
    expect(mine.getThreads()).toEqual([THREAD]);

    const added = await mine.send({
      type: "add",
      commentId: "c2",
      body: "Ship it.",
    });
    expect(added.isOk() && added.value).toEqual(CREATED);
    const [file] = vi.mocked(applyCommentRequest).mock.calls[0];
    expect(file.auth).toBe(writer.auth);
    expect(file.canonicalPath).toBe(writer.canonicalPath);

    await vi.waitFor(() =>
      expect(theirs.getThreads()).toEqual([THREAD, CREATED])
    );
    hocuspocus.flushPendingStores();
    await vi.waitFor(() =>
      expect(
        vi.mocked(saveCollabSession).mock.calls.at(-1)?.[1].comments
      ).toEqual([THREAD, CREATED])
    );

    const refused = await theirs.send({
      type: "reply",
      commentId: "c1",
      position: 2,
      body: "Late.",
    });
    expect(refused.isErr() && refused.error).toBe("thread_changed");
    expect(theirs.getThreads()).toEqual([THREAD, CREATED]);
    expect(dispatchSessionCommentMentions).toHaveBeenCalledOnce();
    expect(vi.mocked(dispatchSessionCommentMentions).mock.calls[0]).toEqual([
      file,
      expect.anything(),
      expect.objectContaining({ type: "add", commentId: "c2" }),
      CREATED.messages[0],
    ]);

    const invalid = await mine.send({
      type: "add",
      commentId: "c3",
      body: "",
    });
    expect(invalid.isErr() && invalid.error).toBe("unavailable");
    expect(applyCommentRequest).toHaveBeenCalledTimes(2);

    mine.close();
    expect(mine.getThreads()).toBeNull();
    const late = await mine.send({ type: "delete", commentId: "c2" });
    expect(late.isErr() && late.error).toBe("unavailable");
  }, 15_000);

  it("saves a comment through the connection that last changed the text", async () => {
    const { writer, hocuspocus, url } = await start();
    const { channel } = await join(url, writer);
    const editor = await collabAccess(true);
    const editing = await hocuspocus.openDirectConnection(
      `${writer.workspaceId}:${writer.canonicalPath}`,
      editor
    );
    await editing.transact((doc) => typeInto(doc, "Edit."));

    const added = await channel.send({
      type: "add",
      commentId: "c2",
      body: "Ship it.",
    });
    expect(added.isOk()).toBe(true);

    hocuspocus.flushPendingStores();
    await vi.waitFor(() => {
      const [through, live] =
        vi.mocked(saveCollabSession).mock.calls.at(-1) ?? [];
      expect(live?.comments).toEqual([THREAD, CREATED]);
      expect(through).toBe(editor);
    });
    await editing.disconnect();
  }, 15_000);

  it("fails the commands a lost connection waits for, then asks for the threads again", async () => {
    const { writer, url } = await start();
    const mine = await join(url, writer);
    const { channel: theirs } = await join(url, writer);
    let release = () => {};
    vi.mocked(applyCommentRequest).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Err("thread_changed"));
        })
    );

    const waiting = mine.channel.send({ type: "delete", commentId: "c1" });
    await vi.waitFor(() =>
      expect(applyCommentRequest).toHaveBeenCalledTimes(1)
    );
    mine.provider.disconnect();
    const lost = await waiting;
    expect(lost.isErr() && lost.error).toBe("unavailable");
    const offline = await mine.channel.send({
      type: "delete",
      commentId: "c1",
    });
    expect(offline.isErr() && offline.error).toBe("unavailable");

    release();
    const added = await theirs.send({
      type: "add",
      commentId: "c2",
      body: "Ship it.",
    });
    expect(added.isOk()).toBe(true);
    expect(mine.channel.getThreads()).toEqual([THREAD]);

    await mine.provider.connect();
    await vi.waitFor(() =>
      expect(mine.channel.getThreads()).toEqual([THREAD, CREATED])
    );
  }, 15_000);

  describe("a write from an agent", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    // Holds the next command until `release`, then accepts or refuses it.
    function holdNextAdd(outcome: "accepted" | "refused") {
      const held = { release: () => {} };
      vi.mocked(applyCommentRequest).mockImplementationOnce(
        (_file, comments) =>
          new Promise((resolve) => {
            held.release = () =>
              resolve(
                outcome === "accepted"
                  ? new Ok({
                      comments: [...comments, CREATED],
                      created: CREATED,
                      added: CREATED.messages[0],
                    })
                  : new Err("thread_changed")
              );
          })
      );
      return held;
    }

    async function startWithHeldAdd(
      outcome: "accepted" | "refused" = "accepted"
    ) {
      const { writer, hocuspocus, url } = await start();
      const { channel } = await join(url, writer);
      const name = toSessionName(writer.workspaceId, writer.canonicalPath);
      const read = await readSessionSource(hocuspocus, name);
      if (read.isErr() || !read.value.open) {
        throw new Error("The document is not open.");
      }
      const base = read.value.source;
      const held = holdNextAdd(outcome);
      const adding = channel.send({
        type: "add",
        commentId: "c2",
        body: "Ship it.",
      });
      await vi.waitFor(() =>
        expect(applyCommentRequest).toHaveBeenCalledTimes(1)
      );
      const edit = () =>
        writeSessionSource(hocuspocus, {
          file: writer,
          base,
          source: base.replace("Hello.", "Hello, edited."),
        });
      return { hocuspocus, name, channel, held, adding, edit };
    }

    async function writeBehindHeldAdd(
      outcome: "accepted" | "refused" = "accepted"
    ) {
      const started = await startWithHeldAdd(outcome);
      const writing = started.edit();
      // Past the document lookup, the write now waits for its turn.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ...started, writing };
    }

    async function liveSource(
      hocuspocus: ReturnType<typeof createCollabHocuspocus>,
      name: string
    ) {
      const read = await readSessionSource(hocuspocus, name);
      return read.isOk() && read.value.open ? read.value.source : null;
    }

    it("waits for the comment command before it, then compares with its threads", async () => {
      const { hocuspocus, name, channel, held, adding, writing } =
        await writeBehindHeldAdd();

      held.release();

      expect((await adding).isOk()).toBe(true);
      expect(await writing).toEqual(new Ok("changed"));
      await vi.waitFor(() =>
        expect(channel.getThreads()).toEqual([THREAD, CREATED])
      );
      const read = await readSessionSource(hocuspocus, name);
      expect(read.isOk() && read.value.open && read.value.source).not.toContain(
        "edited"
      );
    }, 15_000);

    it("answers closed when its document unloads while it waits", async () => {
      const { hocuspocus, name, held, adding, writing } =
        await writeBehindHeldAdd();

      // What `unloadDocument` ends with, which the grace period would otherwise delay by minutes.
      const document = hocuspocus.documents.get(name);
      hocuspocus.documents.delete(name);
      document?.destroy();
      held.release();

      const added = await adding;
      expect(added.isErr() && added.error).toBe("unavailable");
      expect(await writing).toEqual(new Ok("closed"));
    }, 15_000);

    it("answers busy, and never applies, when its turn does not come in time", async () => {
      const { hocuspocus, name, held, adding, edit } =
        await startWithHeldAdd("refused");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      const writing = edit();
      await vi.advanceTimersByTimeAsync(COLLAB_SOURCE_WRITE_WAIT_MS);
      expect(await writing).toEqual(new Ok("busy"));

      vi.useRealTimers();
      held.release();
      expect((await adding).isErr()).toBe(true);
      expect(await liveSource(hocuspocus, name)).not.toContain("edited");
    }, 15_000);

    it("finishes the queued writes before the shutdown save, then answers busy", async () => {
      const { hocuspocus, name, held, writing, edit } =
        await writeBehindHeldAdd("refused");

      const stopping = saveAllSessions(hocuspocus);
      expect(await edit()).toEqual(new Ok("busy"));
      held.release();
      await stopping;

      expect(await writing).toEqual(new Ok("written"));
      expect(await liveSource(hocuspocus, name)).toContain("edited");
      const [, live] = vi.mocked(saveCollabSession).mock.calls.at(-1) ?? [];
      const saved = live ? yDocToDfm(live) : null;
      expect(saved?.isOk() && saved.value).toContain("edited");
    }, 15_000);
  });

  describe("an agent's activity", () => {
    const AGENT = CollabAgentFactory.build();

    /** What reaches a browser, in order: agent messages and document updates. */
    async function watch() {
      const { writer, hocuspocus, url } = await start();
      const { provider } = await join(url, writer);
      const name = toSessionName(writer.workspaceId, writer.canonicalPath);
      const seen: string[] = [];
      const edits: AgentEditMessage[] = [];
      onAgentActivity(provider, ({ agent, activity }) =>
        seen.push(`${agent.name} ${activity}`)
      );
      onAgentEdit(provider, (edit) => {
        edits.push(edit);
        seen.push(`${edit.agent.name} edit`);
      });
      provider.document.on("update", () => seen.push("update"));
      const read = await readSessionSource(hocuspocus, name);
      if (read.isErr() || !read.value.open) {
        throw new Error("The document is not open.");
      }
      return {
        writer,
        hocuspocus,
        name,
        seen,
        edits,
        browser: provider.document,
        base: read.value.source,
      };
    }

    /** The text of `ranges` the browser's document holds, as the editor resolves it. */
    const textOf = (document: Y.Doc, ranges: InsertedIdRange[]) =>
      ranges
        .map(({ client, clock, length }) => {
          const structs = document.store.clients.get(client) ?? [];
          let text = "";
          for (
            let index = Y.findIndexSS(structs, clock);
            index < structs.length && structs[index].id.clock < clock + length;
            index++
          ) {
            const item = structs[index];
            if (
              item instanceof Y.Item &&
              !item.deleted &&
              item.content instanceof Y.ContentString
            ) {
              const from = Math.max(clock, item.id.clock) - item.id.clock;
              const to =
                Math.min(clock + length, item.id.clock + item.length) -
                item.id.clock;
              text += item.content.str.slice(from, to);
            }
          }
          return text;
        })
        .join("");

    // With Hocuspocus's batching, an announcement sent after the change would also arrive first; this
    // checks what the browser receives, not the order in the code.
    it("announces an agent's edit before the edit reaches the browser", async () => {
      const { writer, hocuspocus, seen, base } = await watch();

      const written = await writeSessionSource(hocuspocus, {
        file: writer,
        base,
        source: base.replace("Hello.", "Hello, edited."),
        agent: AGENT,
      });

      expect(written).toEqual(new Ok("written"));
      await vi.waitFor(() => expect(seen).toContain("update"));
      expect(seen[0]).toBe("Writer editing");
    }, 15_000);

    it("announces the text the agent inserted after its update, by ids the browser resolves", async () => {
      const { writer, hocuspocus, seen, edits, browser, base } = await watch();

      await writeSessionSource(hocuspocus, {
        file: writer,
        base,
        source: base.replace("Hello.", "Hello, edited."),
        agent: AGENT,
      });

      await vi.waitFor(() =>
        expect(seen).toEqual(["Writer editing", "update", "Writer edit"])
      );
      expect(edits[0].agent).toEqual(AGENT);
      expect(textOf(browser, edits[0].inserted)).toBe(", edited");
    }, 15_000);

    it("sends someone else's pending change with the agent's, before its announcement", async () => {
      const { writer, hocuspocus, name, seen, edits, browser, base } =
        await watch();
      const document = hocuspocus.documents.get(name);
      if (!document) {
        throw new Error("The document is not open.");
      }

      // Still in Hocuspocus's flush window when the agent writes, and invisible in the source.
      document.getMap("elsewhere").set("touched", true);
      await writeSessionSource(hocuspocus, {
        file: writer,
        base,
        source: base.replace("Hello.", "Hello, edited."),
        agent: AGENT,
      });

      await vi.waitFor(() =>
        expect(seen).toEqual(["Writer editing", "update", "Writer edit"])
      );
      expect(textOf(browser, edits[0].inserted)).toBe(", edited");
    }, 15_000);

    it("takes the announcement back when the agent only changes front matter", async () => {
      const { writer, hocuspocus, seen, base } = await watch();

      const written = await writeSessionSource(hocuspocus, {
        file: writer,
        base,
        source: `---\ntitle: Notes\n---\n\n${base}`,
        agent: AGENT,
      });

      expect(written).toEqual(new Ok("written"));
      await vi.waitFor(() =>
        expect(seen).toEqual(["Writer editing", "Writer reading", "update"])
      );
    }, 15_000);

    it("takes the announcement back when the agent's source changes nothing in the document", async () => {
      const { writer, hocuspocus, seen, base } = await watch();
      const bold = base.replace("Hello.", "**Hello.**");
      await writeSessionSource(hocuspocus, {
        file: writer,
        base,
        source: bold,
      });
      await vi.waitFor(() => expect(seen).toEqual(["update"]));

      // Another spelling of the same document: the editor's model does not change.
      const written = await writeSessionSource(hocuspocus, {
        file: writer,
        base: bold,
        source: bold.replace("**Hello.**", "__Hello.__"),
        agent: AGENT,
      });

      expect(written).toEqual(new Ok("written"));
      await vi.waitFor(() =>
        expect(seen).toEqual(["update", "Writer editing", "Writer reading"])
      );
    }, 15_000);

    it("keeps announcing an edit that only deletes text", async () => {
      const { writer, hocuspocus, seen, base } = await watch();

      const written = await writeSessionSource(hocuspocus, {
        file: writer,
        base,
        source: base.replace("Hello.", "Hello"),
        agent: AGENT,
      });

      expect(written).toEqual(new Ok("written"));
      await vi.waitFor(() => expect(seen).toContain("update"));
      expect(seen.filter((event) => event !== "update")).toEqual([
        "Writer editing",
      ]);
    }, 15_000);

    it("announces nothing for a write without an agent, or one that changes nothing", async () => {
      const { writer, hocuspocus, seen, base } = await watch();
      const edited = base.replace("Hello.", "Hello, edited.");

      await writeSessionSource(hocuspocus, {
        file: writer,
        base,
        source: edited,
      });
      expect(
        await writeSessionSource(hocuspocus, {
          file: writer,
          base: edited,
          source: edited,
          agent: AGENT,
        })
      ).toEqual(new Ok("written"));

      await vi.waitFor(() => expect(seen).toContain("update"));
      expect(seen.filter((event) => event !== "update")).toEqual([]);
    }, 15_000);

    it("shows an agent reading the document", async () => {
      const { hocuspocus, name, seen } = await watch();

      showAgentActivity(hocuspocus, name, AGENT, "reading");

      await vi.waitFor(() => expect(seen).toEqual(["Writer reading"]));
    }, 15_000);
  });
});
