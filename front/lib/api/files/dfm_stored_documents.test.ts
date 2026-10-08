import { Readable } from "node:stream";
import {
  fetchLiveSource,
  pushLiveSource,
} from "@app/lib/api/collab/live_source";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { DfmStoredDocumentError } from "@app/lib/api/files/dfm_stored_documents";
import {
  readCurrentDocumentSource,
  writeDocumentChange,
} from "@app/lib/api/files/dfm_stored_documents";
import {
  readCanonicalFileContent,
  writeCanonicalFileContent,
} from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import type { DfmDocument } from "@app/lib/markdown/dfm";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/collab/live_source"), async (importOriginal) => ({
  ...(await importOriginal()),
  fetchLiveSource: vi.fn(),
  pushLiveSource: vi.fn(),
}));

vi.mock(
  import("@app/lib/api/files/file_system_ops"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    readCanonicalFileContent: vi.fn(),
    writeCanonicalFileContent: vi.fn(),
  })
);

const FILE_SOURCE = "# Notes\n\nFrom the file.\n";
const LIVE_SOURCE = "# Notes\n\nFrom the session.\n";
const HUMAN_SOURCE = "# Notes\n\nFrom the session, typed meanwhile.\n";

function stored(content: string, revision: string | undefined) {
  return new Ok({
    stream: Readable.from([Buffer.from(content, "utf8")]),
    contentType: "text/markdown",
    revision,
  });
}

const appendLine = vi.fn(
  async ({
    document,
  }: {
    document: DfmDocument;
  }): Promise<
    Result<{ document: DfmDocument; value: string }, DfmStoredDocumentError>
  > =>
    new Ok({
      document: { ...document, body: `${document.body}\n\nAppended.` },
      value: "done",
    })
);

describe("writeDocumentChange and readCurrentDocumentSource", () => {
  let auth: Authenticator;
  let dustFs: DustFileSystem;
  let path: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    ({ authenticator: auth } = await createResourceTest({}));
    const fileSystem = await DustFileSystem.forUser(auth);
    if (fileSystem.isErr()) {
      throw fileSystem.error;
    }
    dustFs = fileSystem.value;
    path = `user-${auth.getNonNullableUser().sId}/notes.md`;
    vi.mocked(readCanonicalFileContent).mockImplementation(async () =>
      stored(FILE_SOURCE, "7")
    );
    vi.spyOn(DustFileSystem.prototype, "stat").mockResolvedValue(
      new Ok({ contentType: "text/markdown", sizeBytes: FILE_SOURCE.length })
    );
  });

  it("changes the session's source through the session, never the file, while one is open", async () => {
    vi.mocked(fetchLiveSource).mockResolvedValue(
      new Ok({ open: true, source: LIVE_SOURCE })
    );
    vi.mocked(pushLiveSource).mockResolvedValue(new Ok("written"));

    const result = await writeDocumentChange(auth, dustFs, path, appendLine);

    expect(result).toEqual(new Ok("done"));
    expect(appendLine.mock.calls[0][0]).toMatchObject({
      text: LIVE_SOURCE,
      filePath: path,
    });
    expect(pushLiveSource).toHaveBeenCalledWith(auth, {
      canonicalPath: path,
      base: LIVE_SOURCE,
      source: "# Notes\n\nFrom the session.\n\nAppended.\n",
    });
    expect(readCanonicalFileContent).not.toHaveBeenCalled();
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it.each(["changed", "busy"] as const)(
    "starts over from the session's current source when the write answered %s",
    async (answer) => {
      vi.mocked(fetchLiveSource)
        .mockResolvedValueOnce(new Ok({ open: true, source: LIVE_SOURCE }))
        .mockResolvedValueOnce(new Ok({ open: true, source: HUMAN_SOURCE }));
      vi.mocked(pushLiveSource)
        .mockResolvedValueOnce(new Ok(answer))
        .mockResolvedValueOnce(new Ok("written"));

      const result = await writeDocumentChange(auth, dustFs, path, appendLine);

      expect(result).toEqual(new Ok("done"));
      expect(vi.mocked(pushLiveSource).mock.calls[1][1].base).toBe(
        HUMAN_SOURCE
      );
      expect(writeCanonicalFileContent).not.toHaveBeenCalled();
    }
  );

  it("writes the file, conditional on its revision, once the session closed", async () => {
    vi.mocked(fetchLiveSource)
      .mockResolvedValueOnce(new Ok({ open: true, source: LIVE_SOURCE }))
      .mockResolvedValueOnce(new Ok({ open: false }));
    vi.mocked(pushLiveSource).mockResolvedValue(new Ok("closed"));
    vi.mocked(writeCanonicalFileContent).mockResolvedValue(
      new Ok({ created: false, revision: "8" })
    );

    const result = await writeDocumentChange(auth, dustFs, path, appendLine);

    expect(result).toEqual(new Ok("done"));
    const [, , , content, , revision] = vi.mocked(writeCanonicalFileContent)
      .mock.calls[0];
    expect(Buffer.from(content).toString("utf8")).toBe(
      "# Notes\n\nFrom the file.\n\nAppended.\n"
    );
    expect(revision).toBe("7");
  });

  it("refuses a storage without revisions once the session closed", async () => {
    vi.mocked(readCanonicalFileContent).mockImplementation(async () =>
      stored(FILE_SOURCE, undefined)
    );
    vi.mocked(fetchLiveSource).mockResolvedValue(new Ok({ open: false }));

    const result = await writeDocumentChange(auth, dustFs, path, appendLine);

    expect(result.isErr() && result.error.code).toBe("refused");
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it("refuses a file that does not exist, even while a session is open", async () => {
    vi.mocked(DustFileSystem.prototype.stat).mockResolvedValue(new Ok(null));
    vi.mocked(fetchLiveSource).mockResolvedValue(
      new Ok({ open: true, source: LIVE_SOURCE })
    );

    const written = await writeDocumentChange(auth, dustFs, path, appendLine);
    const read = await readCurrentDocumentSource(auth, dustFs, path);

    expect(written.isErr() && written.error.code).toBe("not_found");
    expect(read.isErr() && read.error.code).toBe("not_found");
    expect(pushLiveSource).not.toHaveBeenCalled();
  });

  it("writes nothing when the collab server cannot tell whether a session is open", async () => {
    vi.mocked(fetchLiveSource).mockResolvedValue(
      new Err({ code: "unavailable", message: "Collab server error (500)." })
    );

    const result = await writeDocumentChange(auth, dustFs, path, appendLine);

    expect(result.isErr() && result.error.code).toBe("storage_failed");
    expect(appendLine).not.toHaveBeenCalled();
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it("reads the session's source while one is open, the file's otherwise", async () => {
    vi.mocked(fetchLiveSource)
      .mockResolvedValueOnce(new Ok({ open: true, source: LIVE_SOURCE }))
      .mockResolvedValueOnce(new Ok({ open: false }));

    expect(await readCurrentDocumentSource(auth, dustFs, path)).toEqual(
      new Ok({ source: LIVE_SOURCE })
    );
    expect(readCanonicalFileContent).not.toHaveBeenCalled();
    expect(await readCurrentDocumentSource(auth, dustFs, path)).toEqual(
      new Ok({ source: FILE_SOURCE })
    );
  });
});
