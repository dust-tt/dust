import {
  checkpointLiveDocument,
  loadLiveDocument,
  openLiveFile,
} from "@app/lib/api/collab/live_file";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES,
  WriteCanonicalFileContentError,
  writeCanonicalFileContent,
} from "@app/lib/api/files/file_system_ops";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { writeUserFile } from "@app/tests/utils/user_files";
import {
  BODY_FRAGMENT_NAME,
  parseLiveDocumentName,
  toLiveDocumentName,
} from "@app/types/collab";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

vi.mock("@app/lib/api/files/file_system_ops", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/files/file_system_ops")>();
  return {
    ...actual,
    writeCanonicalFileContent: vi.fn(actual.writeCanonicalFileContent),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("live document names", () => {
  it("round trip a workspace and a path containing the separator", () => {
    const name = toLiveDocumentName("w1", "user-u1/notes:draft.md");
    expect(parseLiveDocumentName(name)).toEqual({
      workspaceId: "w1",
      canonicalPath: "user-u1/notes:draft.md",
    });
  });

  it("refuse a name without a workspace or a path", () => {
    expect(parseLiveDocumentName("user-u1/notes.md")).toBeNull();
    expect(parseLiveDocumentName(":user-u1/notes.md")).toBeNull();
    expect(parseLiveDocumentName("w1:")).toBeNull();
  });
});

describe("openLiveFile and loadLiveDocument", () => {
  it("open the user's Markdown file for writing and load its content", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.md", "# Notes\n\nHello.\n");

    const file = await openLiveFile(auth, path);
    expect(file.isOk()).toBe(true);
    if (!file.isOk()) {
      return;
    }
    expect(file.value.canWrite).toBe(true);

    const loaded = await loadLiveDocument(file.value);
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(
        loaded.value.live.doc.getXmlFragment(BODY_FRAGMENT_NAME).toString()
      ).toContain("Hello.");
      expect(loaded.value.checkpoint.content).toBe("# Notes\n\nHello.\n");
    }
  });

  it("open a .markdown file, as the editor does", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.markdown", "# Notes\n");

    expect((await openLiveFile(auth, path)).isOk()).toBe(true);
  });

  it("refuse a file that is not Markdown", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const path = await writeUserFile(
      auth,
      "notes.txt",
      "Hello.\n",
      "text/plain"
    );

    expect((await openLiveFile(auth, path)).isErr()).toBe(true);
  });

  it("refuse a path that is not normalized", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    const [scope, name] = path.split("/");

    expect((await openLiveFile(auth, `${scope}/./${name}`)).isErr()).toBe(true);
    expect((await openLiveFile(auth, path)).isOk()).toBe(true);
  });

  it("refuse a path with a trailing slash, which a backend may resolve to the file", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    vi.spyOn(DustFileSystem.prototype, "stat").mockResolvedValue(
      new Ok({ contentType: "text/markdown", sizeBytes: 8 })
    );

    expect((await openLiveFile(auth, `${path}/`)).isErr()).toBe(true);
  });

  it("refuse a missing file", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const path = `user-${auth.getNonNullableUser().sId}/missing.md`;
    fileStorageMock.setFileExists(
      (filePath) => !filePath.endsWith("missing.md")
    );

    expect((await openLiveFile(auth, path)).isErr()).toBe(true);
  });

  it("refuse a directory named like a Markdown file", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    vi.spyOn(DustFileSystem.prototype, "stat").mockResolvedValue(
      new Ok({ contentType: "application/x-directory", sizeBytes: 0 })
    );

    expect((await openLiveFile(auth, path)).isErr()).toBe(true);
  });

  it("refuse a file larger than the file API can write", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.md", "# Notes\n");
    vi.spyOn(DustFileSystem.prototype, "stat").mockResolvedValue(
      new Ok({
        contentType: "text/markdown",
        sizeBytes: WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES + 1,
      })
    );

    expect((await openLiveFile(auth, path)).isErr()).toBe(true);
  });

  it("refuse another user's file", async () => {
    const { authenticator: owner } = await createResourceTest({});
    const { authenticator: other } = await createResourceTest({});
    const path = await writeUserFile(owner, "notes.md", "# Notes\n");

    expect((await openLiveFile(other, path)).isErr()).toBe(true);
  });
});

describe("checkpointLiveDocument", () => {
  async function loadUserFile(text: string) {
    const { authenticator: auth } = await createResourceTest({});
    const path = await writeUserFile(auth, "notes.md", text);
    const file = await openLiveFile(auth, path);
    if (file.isErr()) {
      throw new Error(file.error.message);
    }
    const loaded = await loadLiveDocument(file.value);
    if (loaded.isErr()) {
      throw new Error(loaded.error);
    }
    vi.mocked(writeCanonicalFileContent).mockClear();
    return { auth, file: file.value, ...loaded.value };
  }

  function typeInto(live: { doc: Y.Doc }, text: string) {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText(text)]);
    const body = live.doc.getXmlFragment(BODY_FRAGMENT_NAME);
    body.insert(body.length, [paragraph]);
  }

  it("does not write a document that has not changed", async () => {
    const { file, live, checkpoint } = await loadUserFile("# Notes\n");

    const result = await checkpointLiveDocument(file, live, checkpoint);
    expect(result.isOk() && result.value).toEqual(checkpoint);
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it("writes an edit to the file", async () => {
    const { auth, file, live, checkpoint } = await loadUserFile("# Notes\n");
    typeInto(live, "Edited.");

    const result = await checkpointLiveDocument(file, live, checkpoint);
    expect(result.isOk() && result.value.content).toContain("Edited.");

    const reopened = await openLiveFile(auth, file.canonicalPath);
    expect(reopened.isOk()).toBe(true);
    if (reopened.isOk()) {
      const reloaded = await loadLiveDocument(reopened.value);
      expect(reloaded.isOk() && reloaded.value.checkpoint.content).toContain(
        "Edited."
      );
    }
  });

  it("writes conditional on the last revision and returns the new one", async () => {
    const { file, live, checkpoint } = await loadUserFile("# Notes\n");
    typeInto(live, "Edited.");
    vi.mocked(writeCanonicalFileContent).mockResolvedValueOnce(
      new Ok({ created: false, revision: "8" })
    );

    const result = await checkpointLiveDocument(file, live, {
      ...checkpoint,
      revision: "7",
    });
    expect(result.isOk() && result.value.revision).toBe("8");
    expect(vi.mocked(writeCanonicalFileContent).mock.calls[0][5]).toBe("7");
  });

  it("fails when the file changed since its last revision", async () => {
    const { file, live, checkpoint } = await loadUserFile("# Notes\n");
    typeInto(live, "Edited.");
    vi.mocked(writeCanonicalFileContent).mockResolvedValueOnce(
      new Err(
        new WriteCanonicalFileContentError("revision_conflict", "File changed.")
      )
    );

    const result = await checkpointLiveDocument(file, live, {
      ...checkpoint,
      revision: "7",
    });
    expect(result.isErr()).toBe(true);
  });
});
