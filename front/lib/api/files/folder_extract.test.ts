// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib).

import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { FolderExtractErrorCode } from "@app/lib/api/files/folder_extract";
import {
  extractArchiveToFolder,
  isFolderExtractError,
} from "@app/lib/api/files/folder_extract";
import { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { isDustFileSystemError } from "@app/types/file_system";
import AdmZip from "adm-zip";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Drives the real `DustFileSystem` rather than a stand-in, so entry paths go through the same
 * mount resolution and normalization production uses — which is where containment is decided.
 */
async function setupPodFileSystem(): Promise<{
  dustFs: DustFileSystem;
  podPrefix: string;
  filesRoot: string;
}> {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  const projectSpace = await SpaceFactory.project(workspace, user.id);
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const result = await DustFileSystem.forPod(auth, projectSpace);
  assert(result.isOk());

  return {
    dustFs: result.value,
    podPrefix: `pod-${projectSpace.sId}`,
    filesRoot: `w/${workspace.sId}/pods/${projectSpace.sId}/files`,
  };
}

function savedFilePaths(): string[] {
  return fileStorageMock.saveFileCalls.map((call) => call.filePath).sort();
}

function savedFile(filePath: string) {
  return fileStorageMock.saveFileCalls.find(
    (call) => call.filePath === filePath
  );
}

function makeArchive(entries: { path: string; content?: string }[]): Buffer {
  const zip = new AdmZip();
  for (const entry of entries) {
    if (entry.content === undefined) {
      zip.addFile(`${entry.path.replace(/\/+$/, "")}/`, Buffer.alloc(0));
    } else {
      zip.addFile(entry.path, Buffer.from(entry.content));
    }
  }
  return zip.toBuffer();
}

/**
 * `AdmZip.addFile` sanitizes traversing names on write, so a hostile archive has to be built by
 * substituting the stored name for one of the same byte length — which leaves every zip offset
 * valid. adm-zip reads such names back verbatim, which is exactly what the extractor must refuse.
 */
function makeArchiveWithUnsafeEntry(
  entries: { path: string; content?: string }[],
  placeholder: string,
  unsafePath: string
): Buffer {
  if (placeholder.length !== unsafePath.length) {
    throw new Error("Placeholder and unsafe path must have the same length.");
  }

  return Buffer.from(
    makeArchive(entries).toString("latin1").split(placeholder).join(unsafePath),
    "latin1"
  );
}

function expectExtractError(
  error: unknown,
  code: FolderExtractErrorCode
): void {
  assert(isFolderExtractError(error, code));
}

describe("extractArchiveToFolder", () => {
  beforeEach(() => {
    fileStorageMock.reset();
    fileStorageMock.setFileExists(() => false);
  });

  it("writes entries under the destination, preserving the archive's own root folder", async () => {
    const { dustFs, podPrefix, filesRoot } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      `${podPrefix}/inbox`,
      makeArchive([
        { path: "reports/a.txt", content: "alpha" },
        { path: "reports/nested/b.txt", content: "bravo" },
      ])
    );

    assert(result.isOk());
    expect(result.value.filesWritten).toBe(2);
    expect(savedFilePaths()).toEqual([
      `${filesRoot}/inbox/reports/a.txt`,
      `${filesRoot}/inbox/reports/nested/b.txt`,
    ]);
    expect(savedFile(`${filesRoot}/inbox/reports/a.txt`)?.content).toEqual(
      Buffer.from("alpha")
    );
  });

  it("creates directory entries so empty folders survive the round trip", async () => {
    const { dustFs, podPrefix, filesRoot } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchive([
        { path: "reports/" },
        { path: "reports/empty/" },
        { path: "reports/a.txt", content: "alpha" },
      ])
    );

    assert(result.isOk());
    expect(result.value.directoriesCreated).toBe(2);
    expect(savedFilePaths()).toEqual([
      `${filesRoot}/reports/`,
      `${filesRoot}/reports/a.txt`,
      `${filesRoot}/reports/empty/`,
    ]);
  });

  it("tolerates directories that already exist at the destination", async () => {
    const { dustFs, podPrefix, filesRoot } = await setupPodFileSystem();
    fileStorageMock.setFileExists((filePath) => filePath.endsWith("/reports/"));

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchive([
        { path: "reports/" },
        { path: "reports/a.txt", content: "a" },
      ])
    );

    assert(result.isOk());
    expect(result.value.directoriesCreated).toBe(0);
    expect(savedFilePaths()).toEqual([`${filesRoot}/reports/a.txt`]);
  });

  it("derives the content type from the entry name", async () => {
    const { dustFs, podPrefix, filesRoot } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchive([{ path: "notes.md", content: "# hi" }])
    );

    assert(result.isOk());
    expect(savedFile(`${filesRoot}/notes.md`)?.contentType).toBe(
      "text/markdown"
    );
  });

  it("writes entry types the upload API would reject rather than dropping them", async () => {
    const { dustFs, podPrefix, filesRoot } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchive([{ path: "nested.zip", content: "PK" }])
    );

    assert(result.isOk());
    expect(result.value.filesWritten).toBe(1);
    expect(savedFile(`${filesRoot}/nested.zip`)?.contentType).toBe(
      "application/octet-stream"
    );
  });

  it.each([
    ["a traversing entry", "AA/escaped.txt", "../escaped.txt"],
    [
      "a nested traversing entry",
      "reports/AA/AA/escaped.txt",
      "reports/../../escaped.txt",
    ],
    ["an absolute entry", "Xetc/passwd", "/etc/passwd"],
  ])("rejects %s without writing anything", async (_label, placeholder, unsafePath) => {
    const { dustFs, podPrefix } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      `${podPrefix}/inbox`,
      makeArchiveWithUnsafeEntry(
        [
          { path: "reports/a.txt", content: "alpha" },
          { path: placeholder, content: "evil" },
        ],
        placeholder,
        unsafePath
      )
    );

    assert(result.isErr());
    expectExtractError(result.error, "unsafe_entry_path");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects an entry that only becomes traversal once control characters are stripped", async () => {
    const { dustFs, podPrefix } = await setupPodFileSystem();
    // `DustFileSystem.normalizeScopedPath` strips control characters before normalizing, so a
    // name that is not traversal as stored becomes one by the time it reaches storage.
    const unsafePath = `.${String.fromCharCode(1)}./escaped.txt`;

    const result = await extractArchiveToFolder(
      dustFs,
      `${podPrefix}/inbox`,
      makeArchiveWithUnsafeEntry(
        [
          { path: "reports/a.txt", content: "alpha" },
          { path: "AAA/escaped.txt", content: "evil" },
        ],
        "AAA/escaped.txt",
        unsafePath
      )
    );

    assert(result.isErr());
    expectExtractError(result.error, "unsafe_entry_path");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects an unsafe path even when the entry would otherwise be skipped", async () => {
    const { dustFs, podPrefix } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchiveWithUnsafeEntry(
        [
          { path: "safe.txt", content: "alpha" },
          { path: "Xetc/.DS_Store", content: "junk" },
        ],
        "Xetc/.DS_Store",
        "/etc/.DS_Store"
      )
    );

    assert(result.isErr());
    expectExtractError(result.error, "unsafe_entry_path");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("counts skipped entries toward the entry limit", async () => {
    const { dustFs, podPrefix } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchive([
        { path: "__MACOSX/._a.txt", content: "junk" },
        { path: "a.txt", content: "alpha" },
      ]),
      { maxEntries: 1, maxUncompressedSizeBytes: 1024 }
    );

    assert(result.isErr());
    expectExtractError(result.error, "too_many_entries");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("skips archiver metadata entries", async () => {
    const { dustFs, podPrefix, filesRoot } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchive([
        { path: "__MACOSX/._a.txt", content: "junk" },
        { path: "reports/.DS_Store", content: "junk" },
        { path: "reports/a.txt", content: "alpha" },
      ])
    );

    assert(result.isOk());
    expect(result.value.filesWritten).toBe(1);
    expect(result.value.skippedEntryCount).toBe(2);
    expect(savedFilePaths()).toEqual([`${filesRoot}/reports/a.txt`]);
  });

  it("rejects an archive with more entries than the limit", async () => {
    const { dustFs, podPrefix } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchive([
        { path: "a.txt", content: "a" },
        { path: "b.txt", content: "b" },
        { path: "c.txt", content: "c" },
      ]),
      { maxEntries: 2, maxUncompressedSizeBytes: 1024 }
    );

    assert(result.isErr());
    expectExtractError(result.error, "too_many_entries");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects an archive whose uncompressed size exceeds the limit", async () => {
    const { dustFs, podPrefix } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchive([{ path: "big.txt", content: "x".repeat(2048) }]),
      { maxEntries: 10, maxUncompressedSizeBytes: 1024 }
    );

    assert(result.isErr());
    expectExtractError(result.error, "too_large");
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a buffer that is not a ZIP archive", async () => {
    const { dustFs, podPrefix } = await setupPodFileSystem();

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      Buffer.from("not a zip at all")
    );

    assert(result.isErr());
    expectExtractError(result.error, "invalid_archive");
  });

  it("propagates a file system write failure", async () => {
    const { dustFs, podPrefix } = await setupPodFileSystem();
    fileStorageMock.setFileSaveFails(() => true);

    const result = await extractArchiveToFolder(
      dustFs,
      podPrefix,
      makeArchive([{ path: "a.txt", content: "alpha" }])
    );

    assert(result.isErr());
    assert(isDustFileSystemError(result.error));
  });
});
