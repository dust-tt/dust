import {
  loadLiveDocument,
  openLiveFile,
  parseLiveDocumentName,
  toLiveDocumentName,
} from "@app/lib/api/collab/live_file";
import { BODY_FRAGMENT_NAME } from "@app/lib/api/collab/ydoc";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES,
  writeCanonicalFileContent,
} from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

async function writeUserFile(
  auth: Authenticator,
  name: string,
  text: string,
  contentType = "text/markdown"
) {
  const path = `user-${auth.getNonNullableUser().sId}/${name}`;
  const dustFs = await DustFileSystem.forUser(auth);
  if (dustFs.isErr()) {
    throw dustFs.error;
  }
  const written = await writeCanonicalFileContent(
    auth,
    dustFs.value,
    path,
    new TextEncoder().encode(text),
    contentType
  );
  if (written.isErr()) {
    throw written.error;
  }
  // The storage mock does not keep the type a file was written with.
  fileStorageMock.setFileMetadata((gcsPath) =>
    gcsPath.endsWith(`/${name}`)
      ? { contentType, size: String(text.length) }
      : null
  );
  return path;
}

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

    const live = await loadLiveDocument(file.value);
    expect(live.isOk()).toBe(true);
    if (live.isOk()) {
      expect(
        live.value.doc.getXmlFragment(BODY_FRAGMENT_NAME).toString()
      ).toContain("Hello.");
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
