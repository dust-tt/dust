import {
  loadCollabSession,
  saveCollabSession,
} from "@app/lib/api/collab/session_file";
import { toSessionName } from "@app/types/collab";
import { Ok } from "@app/types/shared/result";
import {
  collabAccess,
  loadSource,
  SOURCE,
  typeInto,
} from "@front-api/lib/collab/collab.test_utils";
import { createCollabHocuspocus } from "@front-api/lib/collab/hocuspocus";
import {
  readSessionSource,
  writeSessionSource,
} from "@front-api/lib/collab/session";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("readSessionSource and writeSessionSource", () => {
  const THREAD_SOURCE =
    "# Notes\n\nHello :comment-start{id=c1}there:comment-end{id=c1}.\n\n" +
    ":::annotations\n::comment{id=c1 status=open}\n\n" +
    '::message{author=agent:agt_1 name="Agent" at=2026-10-05T12:00:00.000Z}\n\nWhy?\n:::\n';
  const EDITED = "# Notes\n\nHello, edited.\n";

  beforeEach(() => {
    vi.mocked(loadCollabSession).mockImplementation(loadSource);
    vi.mocked(saveCollabSession).mockImplementation(
      async (_file, _live, last) =>
        new Ok({ revision: String(Number(last.revision) + 1), source: "" })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A writer, a reader of the same file, and the name of that file's live document. */
  async function collabAccesses() {
    const agent = await collabAccess(true);
    return {
      agent,
      reader: { ...agent, canWrite: false },
      name: toSessionName(agent.workspaceId, agent.canonicalPath),
    };
  }

  async function openSource(
    hocuspocus: ReturnType<typeof createCollabHocuspocus>,
    name: string
  ) {
    const read = await readSessionSource(hocuspocus, name);
    if (read.isErr() || !read.value.open) {
      throw new Error("The document is not open.");
    }
    return read.value.source;
  }

  it("report a document nobody has open as closed, without loading it", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, name } = await collabAccesses();

    expect(await readSessionSource(hocuspocus, name)).toEqual(
      new Ok({ open: false })
    );
    expect(
      await writeSessionSource(hocuspocus, {
        file: agent,
        base: SOURCE,
        source: EDITED,
      })
    ).toEqual(new Ok("closed"));
    expect(loadCollabSession).not.toHaveBeenCalled();
  });

  it("write only the document of the file's own path", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await collabAccesses();
    await hocuspocus.openDirectConnection(name, reader);

    const written = await writeSessionSource(hocuspocus, {
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

  it("write through the open session as the agent's change, then save it", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await collabAccesses();
    vi.useFakeTimers();
    await hocuspocus.openDirectConnection(name, reader);
    const base = await openSource(hocuspocus, name);
    expect(base).toBe(SOURCE);

    const written = await writeSessionSource(hocuspocus, {
      file: agent,
      base,
      source: EDITED,
    });

    expect(written).toEqual(new Ok("written"));
    expect(await openSource(hocuspocus, name)).toBe(EDITED);
    await vi.advanceTimersByTimeAsync(hocuspocus.configuration.maxDebounce);
    expect(saveCollabSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveCollabSession).mock.calls[0][0]).toBe(agent);
  });

  it("refuse a write made against another source, changing nothing", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, name } = await collabAccesses();
    const connection = await hocuspocus.openDirectConnection(name, {
      ...agent,
    });
    const base = await openSource(hocuspocus, name);
    await connection.transact((doc) => typeInto(doc, "Typed meanwhile."));

    const written = await writeSessionSource(hocuspocus, {
      file: agent,
      base,
      source: EDITED,
    });

    expect(written).toEqual(new Ok("changed"));
    expect(await openSource(hocuspocus, name)).toContain("Typed meanwhile.");
    expect(await openSource(hocuspocus, name)).not.toContain("edited");
  });

  it("replace the session's threads, send them to every connection and save them", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await collabAccesses();
    vi.useFakeTimers();
    const connection = await hocuspocus.openDirectConnection(name, reader);
    const broadcast = vi.spyOn(connection.document!, "broadcastStateless");

    const written = await writeSessionSource(hocuspocus, {
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
    const [[writer, live]] = vi.mocked(saveCollabSession).mock.calls;
    expect(writer).toBe(agent);
    expect(live.comments.map(({ id }) => id)).toEqual(["c1"]);
  });

  it("keep applying writes after one that throws", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await collabAccesses();
    const connection = await hocuspocus.openDirectConnection(name, reader);
    vi.spyOn(connection.document!, "broadcastStateless").mockImplementationOnce(
      () => {
        throw new Error("Broadcast failed.");
      }
    );

    await expect(
      writeSessionSource(hocuspocus, {
        file: agent,
        base: await openSource(hocuspocus, name),
        source: THREAD_SOURCE,
      })
    ).rejects.toThrow("Broadcast failed.");
    const written = await writeSessionSource(hocuspocus, {
      file: agent,
      base: await openSource(hocuspocus, name),
      source: EDITED,
    });

    expect(written).toEqual(new Ok("written"));
    expect(await openSource(hocuspocus, name)).toBe(EDITED);
  });

  it("refuse a write to a session whose storage has no revisions, changing nothing", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await collabAccesses();
    vi.mocked(loadCollabSession).mockImplementationOnce(async () => {
      const loaded = await loadSource();
      return new Ok({
        ...loaded.value,
        lastSave: { ...loaded.value.lastSave, revision: undefined },
      });
    });
    await hocuspocus.openDirectConnection(name, reader);

    const written = await writeSessionSource(hocuspocus, {
      file: agent,
      base: SOURCE,
      source: EDITED,
    });

    expect(written.isErr()).toBe(true);
    expect(await openSource(hocuspocus, name)).toBe(SOURCE);
  });

  it("refuse a source the editor refuses, or a file that cannot write, changing nothing", async () => {
    const hocuspocus = createCollabHocuspocus();
    const { agent, reader, name } = await collabAccesses();
    await hocuspocus.openDirectConnection(name, reader);
    const base = await openSource(hocuspocus, name);

    const table = await writeSessionSource(hocuspocus, {
      file: agent,
      base,
      source: "| a | b |\n|---|---|\n| 1 | 2 |\n",
    });
    const unwritable = await writeSessionSource(hocuspocus, {
      file: reader,
      base,
      source: EDITED,
    });

    expect(table.isErr()).toBe(true);
    expect(unwritable.isErr()).toBe(true);
    expect(await openSource(hocuspocus, name)).toBe(base);
  });
});
