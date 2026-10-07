import type { LiveFile } from "@app/lib/api/collab/live_file";
import {
  checkpointLiveDocument,
  loadLiveDocument,
} from "@app/lib/api/collab/live_file";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import { Err, Ok } from "@app/types/shared/result";
import {
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

describe("createCollabHocuspocus", () => {
  beforeEach(() => {
    vi.mocked(loadLiveDocument).mockImplementation(async () => {
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
    });
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
