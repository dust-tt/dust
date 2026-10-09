import { createServer } from "node:http";
import {
  applyLiveCommentCommand,
  dispatchLiveCommentMentions,
} from "@app/lib/api/collab/live_comments";
import type { LiveFile } from "@app/lib/api/collab/live_file";
import {
  checkLiveAccess,
  checkpointLiveDocument,
  loadLiveDocument,
} from "@app/lib/api/collab/live_file";
import { mintLiveTicket } from "@app/lib/api/collab/tickets";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { DustFileSystemError } from "@app/lib/api/file_system";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { Authenticator } from "@app/lib/auth";
import { onLiveAgentActivity } from "@app/lib/client/live_agents";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import { createLiveCommentChannel } from "@app/lib/client/live_comments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { writeUserFile } from "@app/tests/utils/user_files";
import {
  BODY_FRAGMENT_NAME,
  LIVE_SOURCE_WRITE_WAIT_MS,
  toLiveDocumentName,
} from "@app/types/collab";
import { Err, Ok } from "@app/types/shared/result";
import {
  authenticateConnection,
  checkpointAllDocuments,
  createCollabHocuspocus,
  readLiveSource,
  recheckAllConnections,
  showLiveAgentActivity,
  UNLOAD_GRACE_PERIOD_MS,
  writeLiveSource,
} from "@front-api/lib/collab/hocuspocus";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { WebSocketLike } from "@hocuspocus/server";
import { Connection } from "@hocuspocus/server";
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
    // Real until a test stubs it: minting a ticket and connecting both check access.
    checkLiveAccess: vi.fn(actual.checkLiveAccess),
  };
});

vi.mock("@app/lib/api/collab/live_comments", () => ({
  applyLiveCommentCommand: vi.fn(),
  dispatchLiveCommentMentions: vi.fn(async () => undefined),
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

function checkpointNextRevision() {
  vi.mocked(checkpointLiveDocument).mockImplementation(
    async (_file, _live, last) =>
      new Ok({
        revision: String(Number(last.revision) + 1),
        content: "written",
      })
  );
}

describe("createCollabHocuspocus", () => {
  beforeEach(() => {
    vi.mocked(loadLiveDocument).mockImplementation(loadSource);
    checkpointNextRevision();
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

describe("readLiveSource and writeLiveSource", () => {
  const THREAD_SOURCE =
    "# Notes\n\nHello :comment-start{id=c1}there:comment-end{id=c1}.\n\n" +
    ":::annotations\n::comment{id=c1 status=open}\n\n" +
    '::message{author=agent:agt_1 name="Agent" at=2026-10-05T12:00:00.000Z}\n\nWhy?\n:::\n';
  const EDITED = "# Notes\n\nHello, edited.\n";

  beforeEach(() => {
    vi.mocked(loadLiveDocument).mockImplementation(loadSource);
    vi.mocked(checkpointLiveDocument).mockImplementation(
      async (_file, _live, last) =>
        new Ok({ revision: String(Number(last.revision) + 1), content: "" })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A writer, a reader of the same file, and the name of that file's live document. */
  async function liveFiles() {
    const agent = await liveFile(true);
    return {
      agent,
      reader: { ...agent, canWrite: false },
      name: toLiveDocumentName(agent.workspaceId, agent.canonicalPath),
    };
  }

  async function openSource(
    hocuspocus: ReturnType<typeof createCollabHocuspocus>,
    name: string
  ) {
    const read = await readLiveSource(hocuspocus, name);
    if (read.isErr() || !read.value.open) {
      throw new Error("The document is not open.");
    }
    return read.value.source;
  }

  it("report a document nobody has open as closed, without loading it", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, name } = await liveFiles();

    expect(await readLiveSource(hocuspocus, name)).toEqual(
      new Ok({ open: false })
    );
    expect(
      await writeLiveSource(hocuspocus, {
        file: agent,
        base: SOURCE,
        source: EDITED,
      })
    ).toEqual(new Ok("closed"));
    expect(loadLiveDocument).not.toHaveBeenCalled();
  });

  it("write only the document of the file's own path", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await liveFiles();
    await hocuspocus.openDirectConnection(name, reader);

    const written = await writeLiveSource(hocuspocus, {
      file: {
        ...agent,
        canonicalPath: agent.canonicalPath.replace("notes.md", "other.md"),
      },
      base: SOURCE,
      source: EDITED,
    });

    expect(written).toEqual(new Ok("closed"));
    expect(await openSource(hocuspocus, name)).toBe(SOURCE);
  });

  it("write through the open session as the agent's change, then checkpoint it", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await liveFiles();
    vi.useFakeTimers();
    await hocuspocus.openDirectConnection(name, reader);
    const base = await openSource(hocuspocus, name);
    expect(base).toBe(SOURCE);

    const written = await writeLiveSource(hocuspocus, {
      file: agent,
      base,
      source: EDITED,
    });

    expect(written).toEqual(new Ok("written"));
    expect(await openSource(hocuspocus, name)).toBe(EDITED);
    await vi.advanceTimersByTimeAsync(hocuspocus.configuration.maxDebounce);
    expect(checkpointLiveDocument).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkpointLiveDocument).mock.calls[0][0]).toBe(agent);
  });

  it("refuse a write made against another source, changing nothing", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, name } = await liveFiles();
    const connection = await hocuspocus.openDirectConnection(name, {
      ...agent,
    });
    const base = await openSource(hocuspocus, name);
    await connection.transact((doc) => typeInto(doc, "Typed meanwhile."));

    const written = await writeLiveSource(hocuspocus, {
      file: agent,
      base,
      source: EDITED,
    });

    expect(written).toEqual(new Ok("changed"));
    expect(await openSource(hocuspocus, name)).toContain("Typed meanwhile.");
    expect(await openSource(hocuspocus, name)).not.toContain("edited");
  });

  it("replace the session's threads, send them to every connection and checkpoint them", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await liveFiles();
    vi.useFakeTimers();
    const connection = await hocuspocus.openDirectConnection(name, reader);
    const broadcast = vi.spyOn(connection.document!, "broadcastStateless");

    const written = await writeLiveSource(hocuspocus, {
      file: agent,
      base: await openSource(hocuspocus, name),
      source: THREAD_SOURCE,
    });

    expect(written).toEqual(new Ok("written"));
    expect(await openSource(hocuspocus, name)).toBe(THREAD_SOURCE);
    expect(broadcast).toHaveBeenCalledTimes(1);
    const [message] = broadcast.mock.calls[0];
    expect(JSON.parse(message)).toMatchObject({
      type: "threads",
      comments: [{ id: "c1" }],
    });
    await vi.advanceTimersByTimeAsync(hocuspocus.configuration.maxDebounce);
    const [[writer, live]] = vi.mocked(checkpointLiveDocument).mock.calls;
    expect(writer).toBe(agent);
    expect(live.comments.map(({ id }) => id)).toEqual(["c1"]);
  });

  it("keep applying writes after one that throws", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await liveFiles();
    const connection = await hocuspocus.openDirectConnection(name, reader);
    vi.spyOn(connection.document!, "broadcastStateless").mockImplementationOnce(
      () => {
        throw new Error("Broadcast failed.");
      }
    );

    await expect(
      writeLiveSource(hocuspocus, {
        file: agent,
        base: await openSource(hocuspocus, name),
        source: THREAD_SOURCE,
      })
    ).rejects.toThrow("Broadcast failed.");
    const written = await writeLiveSource(hocuspocus, {
      file: agent,
      base: await openSource(hocuspocus, name),
      source: EDITED,
    });

    expect(written).toEqual(new Ok("written"));
    expect(await openSource(hocuspocus, name)).toBe(EDITED);
  });

  it("refuse a write to a session whose storage has no revisions, changing nothing", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await liveFiles();
    vi.mocked(loadLiveDocument).mockImplementationOnce(async () => {
      const loaded = await loadSource();
      return new Ok({
        ...loaded.value,
        checkpoint: { ...loaded.value.checkpoint, revision: undefined },
      });
    });
    await hocuspocus.openDirectConnection(name, reader);

    const written = await writeLiveSource(hocuspocus, {
      file: agent,
      base: SOURCE,
      source: EDITED,
    });

    expect(written.isErr()).toBe(true);
    expect(await openSource(hocuspocus, name)).toBe(SOURCE);
  });

  it("refuse a source the editor refuses, or a file that cannot write, changing nothing", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await liveFiles();
    await hocuspocus.openDirectConnection(name, reader);
    const base = await openSource(hocuspocus, name);

    const table = await writeLiveSource(hocuspocus, {
      file: agent,
      base,
      source: "| a | b |\n|---|---|\n| 1 | 2 |\n",
    });
    const unwritable = await writeLiveSource(hocuspocus, {
      file: reader,
      base,
      source: EDITED,
    });

    expect(table.isErr()).toBe(true);
    expect(unwritable.isErr()).toBe(true);
    expect(await openSource(hocuspocus, name)).toBe(base);
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
  const channels: LiveCommentChannel[] = [];
  let close: () => void = () => undefined;

  beforeEach(() => {
    checkpointNextRevision();
    vi.mocked(dispatchLiveCommentMentions).mockClear();
  });

  afterEach(() => {
    channels.forEach((channel) => channel.close());
    providers.forEach((provider) => provider.destroy());
    close();
    vi.restoreAllMocks();
    vi.mocked(checkLiveAccess).mockReset();
  });

  // The socket handlers run outside the test's database transaction: authentication and the
  // commands, tested on their own, are stubbed.
  async function start() {
    const writer = await liveFile(true);
    await FeatureFlagFactory.basic(writer.auth, "co_edition");
    vi.spyOn(Authenticator, "fromUserIdAndWorkspaceId").mockResolvedValue(
      writer.auth
    );
    vi.mocked(checkLiveAccess).mockResolvedValue(new Ok(writer));
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

  async function join(url: string, writer: LiveFile) {
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
    const channel = createLiveCommentChannel(provider, null);
    channels.push(channel);
    await vi.waitFor(() => expect(channel.getThreads()).not.toBeNull());
    return { channel, provider };
  }

  it("serves the threads, applies a command for every connection and checkpoints it", async () => {
    const { writer, url } = await start();
    const { channel: mine } = await join(url, writer);
    const { channel: theirs } = await join(url, writer);
    expect(mine.getThreads()).toEqual([THREAD]);

    const added = await mine.send({
      type: "add",
      commentId: "c2",
      body: "Ship it.",
    });
    expect(added.isOk() && added.value).toEqual(CREATED);
    const [file] = vi.mocked(applyLiveCommentCommand).mock.calls[0];
    expect(file.auth).toBe(writer.auth);
    expect(file.canonicalPath).toBe(writer.canonicalPath);

    await vi.waitFor(() =>
      expect(theirs.getThreads()).toEqual([THREAD, CREATED])
    );
    await vi.waitFor(
      () =>
        expect(
          vi.mocked(checkpointLiveDocument).mock.calls.at(-1)?.[1].comments
        ).toEqual([THREAD, CREATED]),
      { timeout: 5_000 }
    );

    const refused = await theirs.send({
      type: "reply",
      commentId: "c1",
      position: 2,
      body: "Late.",
    });
    expect(refused.isErr() && refused.error).toBe("thread_changed");
    expect(theirs.getThreads()).toEqual([THREAD, CREATED]);
    expect(dispatchLiveCommentMentions).toHaveBeenCalledOnce();
    expect(vi.mocked(dispatchLiveCommentMentions).mock.calls[0]).toEqual([
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
    expect(applyLiveCommentCommand).toHaveBeenCalledTimes(2);

    mine.close();
    expect(mine.getThreads()).toBeNull();
    const late = await mine.send({ type: "delete", commentId: "c2" });
    expect(late.isErr() && late.error).toBe("unavailable");
  }, 15_000);

  it("checkpoints a comment through the connection that last changed the text", async () => {
    const { writer, hocuspocus, url } = await start();
    const { channel } = await join(url, writer);
    const editor = await liveFile(true);
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

    await vi.waitFor(
      () => {
        const [through, live] =
          vi.mocked(checkpointLiveDocument).mock.calls.at(-1) ?? [];
        expect(live?.comments).toEqual([THREAD, CREATED]);
        expect(through).toBe(editor);
      },
      { timeout: 5_000 }
    );
    await editing.disconnect();
  }, 15_000);

  it("fails the commands a lost connection waits for, then asks for the threads again", async () => {
    const { writer, url } = await start();
    const mine = await join(url, writer);
    const { channel: theirs } = await join(url, writer);
    let release = () => {};
    vi.mocked(applyLiveCommentCommand).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Err("thread_changed"));
        })
    );

    const waiting = mine.channel.send({ type: "delete", commentId: "c1" });
    await vi.waitFor(() =>
      expect(applyLiveCommentCommand).toHaveBeenCalledTimes(1)
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
      vi.mocked(applyLiveCommentCommand).mockImplementationOnce(
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
      const name = toLiveDocumentName(writer.workspaceId, writer.canonicalPath);
      const read = await readLiveSource(hocuspocus, name);
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
        expect(applyLiveCommentCommand).toHaveBeenCalledTimes(1)
      );
      const edit = () =>
        writeLiveSource(hocuspocus, {
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
      const read = await readLiveSource(hocuspocus, name);
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
      const read = await readLiveSource(hocuspocus, name);
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
      await vi.advanceTimersByTimeAsync(LIVE_SOURCE_WRITE_WAIT_MS);
      expect(await writing).toEqual(new Ok("busy"));

      vi.useRealTimers();
      held.release();
      expect((await adding).isErr()).toBe(true);
      expect(await liveSource(hocuspocus, name)).not.toContain("edited");
    }, 15_000);

    it("finishes the queued writes before the shutdown checkpoint, then answers busy", async () => {
      const { hocuspocus, name, held, writing, edit } =
        await writeBehindHeldAdd("refused");

      const stopping = checkpointAllDocuments(hocuspocus);
      expect(await edit()).toEqual(new Ok("busy"));
      held.release();
      await stopping;

      expect(await writing).toEqual(new Ok("written"));
      expect(await liveSource(hocuspocus, name)).toContain("edited");
      const [, live] =
        vi.mocked(checkpointLiveDocument).mock.calls.at(-1) ?? [];
      const checkpointed = live ? yDocToDfm(live) : null;
      expect(checkpointed?.isOk() && checkpointed.value).toContain("edited");
    }, 15_000);
  });

  describe("an agent's activity", () => {
    const AGENT = { agentId: "agt_1", name: "Writer" };

    /** What reaches a browser, in order: agent messages and document updates. */
    async function watch() {
      const { writer, hocuspocus, url } = await start();
      const { provider } = await join(url, writer);
      const name = toLiveDocumentName(writer.workspaceId, writer.canonicalPath);
      const seen: string[] = [];
      onLiveAgentActivity(provider, ({ agent, activity }) =>
        seen.push(`${agent.name} ${activity}`)
      );
      provider.document.on("update", () => seen.push("update"));
      const read = await readLiveSource(hocuspocus, name);
      if (read.isErr() || !read.value.open) {
        throw new Error("The document is not open.");
      }
      return { writer, hocuspocus, name, seen, base: read.value.source };
    }

    // With Hocuspocus's batching, an announcement sent after the change would also arrive first; this
    // checks what the browser receives, not the order in the code.
    it("announces an agent's edit before the edit reaches the browser", async () => {
      const { writer, hocuspocus, seen, base } = await watch();

      const written = await writeLiveSource(hocuspocus, {
        file: writer,
        base,
        source: base.replace("Hello.", "Hello, edited."),
        agent: AGENT,
      });

      expect(written).toEqual(new Ok("written"));
      await vi.waitFor(() => expect(seen).toContain("update"));
      expect(seen[0]).toBe("Writer editing");
    }, 15_000);

    it("takes the announcement back when the agent's source changes nothing in the document", async () => {
      const { writer, hocuspocus, seen, base } = await watch();
      const bold = base.replace("Hello.", "**Hello.**");
      await writeLiveSource(hocuspocus, { file: writer, base, source: bold });
      await vi.waitFor(() => expect(seen).toEqual(["update"]));

      // Another spelling of the same document: the editor's model does not change.
      const written = await writeLiveSource(hocuspocus, {
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

      const written = await writeLiveSource(hocuspocus, {
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

      await writeLiveSource(hocuspocus, { file: writer, base, source: edited });
      expect(
        await writeLiveSource(hocuspocus, {
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

      showLiveAgentActivity(hocuspocus, name, AGENT, "reading");

      await vi.waitFor(() => expect(seen).toEqual(["Writer reading"]));
    }, 15_000);
  });
});

describe("recheckAllConnections", () => {
  beforeEach(() => {
    vi.mocked(loadLiveDocument).mockImplementation(loadSource);
  });

  /** A WebSocket connection to the user's own file, open as after a successful connect. */
  async function openConnection(hocuspocus = createCollabHocuspocus()) {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "co_edition");
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const file = await checkLiveAccess(auth, path);
    if (file.isErr()) {
      throw new Error(file.error.message);
    }
    const request = new Request("http://localhost/api/collab");
    const document = await hocuspocus.createDocument(
      toLiveDocumentName(workspace.sId, path),
      request,
      "socket",
      { readOnly: false, isAuthenticated: true },
      file.value
    );
    const socket = { send: vi.fn(), close: vi.fn(), readyState: 1 };
    const connection = new Connection(
      socket,
      request,
      document,
      "socket",
      file.value
    );
    return { hocuspocus, document, connection, workspace, user };
  }

  it("keeps a connection whose user still has access", async () => {
    const { hocuspocus, document } = await openConnection();

    await recheckAllConnections(hocuspocus);

    expect(document.getConnectionsCount()).toBe(1);
  });

  it("does not read the file from storage", async () => {
    const { hocuspocus } = await openConnection();
    const stat = vi.spyOn(DustFileSystem.prototype, "stat");

    await recheckAllConnections(hocuspocus);

    expect(stat).not.toHaveBeenCalled();
    stat.mockRestore();
  });

  it("closes a connection once co_edition is turned off", async () => {
    const { hocuspocus, document, workspace } = await openConnection();
    await FeatureFlagResource.disable(workspace, "co_edition");

    await recheckAllConnections(hocuspocus);

    expect(document.getConnectionsCount()).toBe(0);
  });

  it("closes a connection once its user left the workspace", async () => {
    const { hocuspocus, document, workspace, user } = await openConnection();
    const revoked = await MembershipResource.revokeMembership({
      user,
      workspace,
    });
    if (revoked.isErr()) {
      throw revoked.error;
    }

    await recheckAllConnections(hocuspocus);

    expect(document.getConnectionsCount()).toBe(0);
  });

  it("closes a connection it fails to check, and still checks the others", async () => {
    const hocuspocus = createCollabHocuspocus();
    const failing = await openConnection(hocuspocus);
    const kept = await openConnection(hocuspocus);
    const revoked = await openConnection(hocuspocus);
    await FeatureFlagResource.disable(revoked.workspace, "co_edition");
    const build = Authenticator.fromUserIdAndWorkspaceId.bind(Authenticator);
    const spy = vi
      .spyOn(Authenticator, "fromUserIdAndWorkspaceId")
      .mockImplementation(async (userId, workspaceId) => {
        if (userId === failing.user.sId) {
          throw new Error("Database unavailable.");
        }
        return build(userId, workspaceId);
      });

    await recheckAllConnections(hocuspocus);

    expect(failing.document.getConnectionsCount()).toBe(0);
    expect(kept.document.getConnectionsCount()).toBe(1);
    expect(revoked.document.getConnectionsCount()).toBe(0);
    spy.mockRestore();
  });

  it("closes a connection once its user can only read the file", async () => {
    const { hocuspocus, document } = await openConnection();
    const readOnly = vi
      .spyOn(DustFileSystem.prototype, "checkWriteAccess")
      .mockReturnValue(
        new Err(new DustFileSystemError("internal", "Read-only mount."))
      );

    await recheckAllConnections(hocuspocus);

    expect(document.getConnectionsCount()).toBe(0);
    readOnly.mockRestore();
  });
});
