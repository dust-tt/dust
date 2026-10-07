import type { LiveFile } from "@app/lib/api/collab/live_file";
import {
  checkpointLiveDocument,
  loadLiveDocument,
} from "@app/lib/api/collab/live_file";
import { mintLiveTicket } from "@app/lib/api/collab/tickets";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

vi.mock("@app/lib/api/collab/live_file", async (importActual) => ({
  ...(await importActual<typeof import("@app/lib/api/collab/live_file")>()),
  loadLiveDocument: vi.fn(),
  checkpointLiveDocument: vi.fn(),
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

describe("authenticateConnection", () => {
  async function ticketFor(auth: Authenticator, path: string) {
    const ticket = await mintLiveTicket(auth, path);
    if (ticket.isErr()) {
      throw new Error(ticket.error.message);
    }
    return ticket.value;
  }

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
