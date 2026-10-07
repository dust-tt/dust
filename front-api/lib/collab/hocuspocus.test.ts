import { createServer } from "node:http";
import { applyLiveCommentCommand } from "@app/lib/api/collab/live_comments";
import type { LiveFile } from "@app/lib/api/collab/live_file";
import {
  checkpointLiveDocument,
  loadLiveDocument,
  openLiveFile,
} from "@app/lib/api/collab/live_file";
import { mintLiveTicket } from "@app/lib/api/collab/tickets";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { Authenticator } from "@app/lib/auth";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import { createLiveCommentChannel } from "@app/lib/client/live_comments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { writeUserFile } from "@app/tests/utils/user_files";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import { Err, Ok } from "@app/types/shared/result";
import {
  authenticateConnection,
  checkpointAllDocuments,
  createCollabHocuspocus,
  UNLOAD_GRACE_PERIOD_MS,
} from "@front-api/lib/collab/hocuspocus";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { WebSocketLike } from "@hocuspocus/server";
import type { Peer } from "crossws";
import crossws from "crossws/adapters/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

vi.mock("@app/lib/api/collab/live_file", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/collab/live_file")>();
  return {
    ...actual,
    loadLiveDocument: vi.fn(),
    checkpointLiveDocument: vi.fn(),
    // Real until a test stubs it: tickets open the file they are minted for.
    openLiveFile: vi.fn(actual.openLiveFile),
  };
});

vi.mock("@app/lib/api/collab/live_comments", () => ({
  applyLiveCommentCommand: vi.fn(),
}));

const DOCUMENT_NAME = "w1:user-u1/notes.md";
const SOURCE = "# Notes\n\nHello.\n";
const COMMENTS: DfmComment[] = [];

// TODO(co-edition): open a written file through `openLiveFile` instead, and share `typeInto` with
// live_file.test.ts.
async function liveFile(canWrite: boolean): Promise<LiveFile> {
  const { authenticator: auth, workspace } = await createResourceTest({});
  const dustFs = await DustFileSystem.forUser(auth);
  if (dustFs.isErr()) {
    throw dustFs.error;
  }
  return {
    auth,
    workspaceId: workspace.sId,
    canonicalPath: `user-${auth.getNonNullableUser().sId}/notes.md`,
    dustFs: dustFs.value,
    canWrite,
  };
}

function typeInto(doc: Y.Doc, text: string) {
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(text)]);
  const body = doc.getXmlFragment(BODY_FRAGMENT_NAME);
  body.insert(body.length, [paragraph]);
}

/** What `loadLiveDocument` returns for `SOURCE`, with fresh Yjs identities each time. */
async function loadSource() {
  const live = dfmToYDoc(SOURCE);
  if (live.isErr()) {
    throw new Error(live.error);
  }
  const content = yDocToDfm(live.value);
  if (content.isErr()) {
    throw new Error(content.error);
  }
  return new Ok({
    live: { doc: live.value.doc, comments: COMMENTS },
    checkpoint: { revision: "1", content: content.value },
  });
}

describe("createCollabHocuspocus", () => {
  beforeEach(() => {
    vi.mocked(loadLiveDocument).mockImplementation(loadSource);
    vi.mocked(checkpointLiveDocument).mockImplementation(
      async (_file, _live, last) =>
        new Ok({
          revision: String(Number(last.revision) + 1),
          content: "written",
        })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checkpoints each edit with the loaded threads, after the last revision written", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await liveFile(true);
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

    const calls = vi.mocked(checkpointLiveDocument).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(writer);
    expect(calls[0][1].comments).toBe(COMMENTS);
    expect(calls.map(([, , last]) => last.revision)).toEqual(["1", "2"]);
    expect(loadLiveDocument).toHaveBeenCalledTimes(1);
  });

  it("checkpoints every document at once on shutdown, edits waiting for their store included", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await liveFile(true);
    vi.useFakeTimers();

    const edited = await hocuspocus.openDirectConnection(DOCUMENT_NAME, writer);
    await edited.transact((doc) => typeInto(doc, "Not stored yet."));
    await hocuspocus.openDirectConnection("w1:user-u1/untouched.md", writer);
    expect(checkpointLiveDocument).not.toHaveBeenCalled();

    await checkpointAllDocuments(hocuspocus);

    expect(checkpointLiveDocument).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkpointLiveDocument).mock.calls[0][0]).toBe(writer);
    // The debounced store it replaced does not run again.
    await vi.advanceTimersByTimeAsync(hocuspocus.configuration.maxDebounce);
    expect(checkpointLiveDocument).toHaveBeenCalledTimes(1);
  });

  it("waits on shutdown for a document still loading", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await liveFile(true);
    let finishLoad = () => {};
    vi.mocked(loadLiveDocument).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finishLoad = resolve;
      });
      return loadSource();
    });

    const opening = hocuspocus.openDirectConnection(DOCUMENT_NAME, writer);
    let checkpointed = false;
    const shutdown = checkpointAllDocuments(hocuspocus).then(() => {
      checkpointed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(checkpointed).toBe(false);

    finishLoad();
    await opening;
    await shutdown;
    expect(checkpointed).toBe(true);
  });

  it("keeps a document for the grace period, then reads the file again", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await liveFile(true);
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
    expect(loadLiveDocument).toHaveBeenCalledTimes(2);
    await reopened.disconnect();
  });

  it("keeps a document a client came back to during the grace period", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await liveFile(true);
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
    expect(loadLiveDocument).toHaveBeenCalledTimes(1);
  });

  it("keeps a document whose checkpoint failed after the grace period", async () => {
    vi.mocked(checkpointLiveDocument).mockResolvedValue(
      new Err("This file changed since it was loaded.")
    );
    const hocuspocus = createCollabHocuspocus();
    const writer = await liveFile(true);
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

  it("checkpoints through the last writer when a reader disconnects", async () => {
    const hocuspocus = createCollabHocuspocus();
    const writer = await liveFile(true);
    const reader = await liveFile(false);
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
    expect(checkpointLiveDocument).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkpointLiveDocument).mock.calls[0][0]).toBe(writer);

    await writing.disconnect();
    await vi.advanceTimersByTimeAsync(UNLOAD_GRACE_PERIOD_MS);
    expect(hocuspocus.getDocumentsCount()).toBe(0);
  });

  it("refuses to checkpoint an edit made without write access", async () => {
    const hocuspocus = createCollabHocuspocus();
    const reader = await liveFile(false);
    vi.useFakeTimers();

    const connection = await hocuspocus.openDirectConnection(
      DOCUMENT_NAME,
      reader
    );
    await connection.transact((doc) => typeInto(doc, "Edit."));
    await connection.disconnect();

    expect(checkpointLiveDocument).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UNLOAD_GRACE_PERIOD_MS);
    expect(hocuspocus.getDocumentsCount()).toBe(1);
  });
});

async function ticketFor(auth: Authenticator, path: string) {
  const ticket = await mintLiveTicket(auth, path);
  if (ticket.isErr()) {
    throw new Error(ticket.error.message);
  }
  return ticket.value;
}

describe("authenticateConnection", () => {
  it("opens the ticket's file for its user, once", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const name = { workspaceId: workspace.sId, canonicalPath: path };
    const ticket = await ticketFor(auth, path);

    const first = await authenticateConnection(name, ticket);
    expect(first.isOk() && first.value.canonicalPath).toBe(path);
    expect(first.isOk() && first.value.canWrite).toBe(true);

    const second = await authenticateConnection(name, ticket);
    expect(second.isErr() && second.error).toBe("Invalid or expired ticket.");
  });

  it("refuses a ticket minted for another file", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const notes = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, notes);
    const other = notes.replace("notes.md", "other.md");

    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: other },
      ticket
    );

    expect(result.isErr() && result.error).toBe("Invalid or expired ticket.");
  });

  it("refuses a ticket used for another workspace", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, path);

    const result = await authenticateConnection(
      { workspaceId: "w_other", canonicalPath: path },
      ticket
    );

    expect(result.isErr() && result.error).toBe("Invalid or expired ticket.");
  });

  it("refuses a user who left the workspace after the ticket was minted", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, path);
    const revoked = await MembershipResource.revokeMembership({
      user,
      workspace,
    });
    if (revoked.isErr()) {
      throw revoked.error;
    }

    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: path },
      ticket
    );

    expect(result.isErr() && result.error).toBe(
      "Not a member of this workspace."
    );
  });

  it("refuses a ticket once co_edition is turned off", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, path);
    await FeatureFlagResource.disable(workspace, "co_edition");

    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: path },
      ticket
    );

    expect(result.isErr() && result.error).toBe(
      "Live editing is not available here."
    );
  });

  it("refuses a ticket once the workspace is in maintenance", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const ticket = await ticketFor(auth, path);
    await WorkspaceResource.updateMetadata(workspace.id, {
      maintenance: "relocation",
    });

    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: path },
      ticket
    );

    expect(result.isErr() && result.error).toBe(
      "This workspace is not available (maintenance)."
    );
  });

  it("refuses a token that is not a ticket", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");

    // What the browser sent before tickets: the user's own id.
    const result = await authenticateConnection(
      { workspaceId: workspace.sId, canonicalPath: path },
      user.sId
    );

    expect(result.isErr() && result.error).toBe("Invalid or expired ticket.");
  });
});

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
// client message, a command whose document unloads before it finishes, and a command a closed
// channel was waiting for.
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
  const providers: HocuspocusProvider[] = [];
  const channels: LiveCommentChannel[] = [];
  let close: () => void = () => undefined;

  afterEach(() => {
    channels.forEach((channel) => channel.close());
    providers.forEach((provider) => provider.destroy());
    close();
  });

  async function join(url: string, writer: LiveFile) {
    const provider = new HocuspocusProvider({
      url,
      name: `${writer.workspaceId}:${writer.canonicalPath}`,
      token: await ticketFor(writer.auth, writer.canonicalPath),
      document: new Y.Doc(),
    });
    providers.push(provider);
    await new Promise<void>((resolve) => provider.on("synced", resolve));
    const channel = createLiveCommentChannel(provider);
    channels.push(channel);
    await vi.waitFor(() => expect(channel.getThreads()).not.toBeNull());
    return channel;
  }

  // The socket handlers run outside the test's database transaction: authentication and the
  // commands, tested on their own, are stubbed.
  it("serves the threads, applies a command for every connection and checkpoints it", async () => {
    const writer = await liveFile(true);
    await FeatureFlagFactory.basic(writer.auth, "co_edition");
    const created: DfmComment = { ...THREAD, id: "c2" };
    vi.spyOn(Authenticator, "fromUserIdAndWorkspaceId").mockResolvedValue(
      writer.auth
    );
    vi.mocked(openLiveFile).mockResolvedValue(new Ok(writer));
    vi.mocked(loadLiveDocument).mockImplementation(async () => {
      const live = dfmToYDoc(SOURCE);
      if (live.isErr()) {
        throw new Error(live.error);
      }
      return new Ok({
        live: { doc: live.value.doc, comments: [THREAD] },
        checkpoint: { revision: "1", content: "" },
      });
    });
    vi.mocked(applyLiveCommentCommand).mockImplementation(
      async (_file, comments, command) =>
        command.type === "add"
          ? new Ok({ comments: [...comments, created], created })
          : new Err("thread_changed")
    );
    const server = await serve(createCollabHocuspocus());
    close = server.close;

    const mine = await join(server.url, writer);
    const theirs = await join(server.url, writer);
    expect(mine.getThreads()).toEqual([THREAD]);

    const added = await mine.send({
      type: "add",
      commentId: "c2",
      body: "Ship it.",
    });
    expect(added.isOk() && added.value).toEqual(created);
    const [file] = vi.mocked(applyLiveCommentCommand).mock.calls[0];
    expect(file.auth).toBe(writer.auth);
    expect(file.canonicalPath).toBe(writer.canonicalPath);

    await vi.waitFor(() =>
      expect(theirs.getThreads()).toEqual([THREAD, created])
    );
    await vi.waitFor(
      () =>
        expect(
          vi.mocked(checkpointLiveDocument).mock.calls.at(-1)?.[1].comments
        ).toEqual([THREAD, created]),
      { timeout: 5_000 }
    );

    const refused = await theirs.send({
      type: "reply",
      commentId: "c1",
      position: 2,
      body: "Late.",
    });
    expect(refused.isErr() && refused.error).toBe("thread_changed");
    expect(theirs.getThreads()).toEqual([THREAD, created]);

    const invalid = await mine.send({
      type: "add",
      commentId: "c3",
      body: "",
    });
    expect(invalid.isErr() && invalid.error).toBe("unavailable");
    expect(applyLiveCommentCommand).toHaveBeenCalledTimes(2);

    mine.close();
    expect(mine.getThreads()).toBeNull();
    const late = await mine.send({ type: "delete", commentId: "c2" });
    expect(late.isErr() && late.error).toBe("unavailable");
  }, 15_000);
});
