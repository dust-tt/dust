// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib).

import type { FolderExtractFileSystem } from "@app/lib/api/files/folder_extract";
import {
  extractArchiveToFolder,
  isFolderExtractError,
} from "@app/lib/api/files/folder_extract";
import {
  DustFileSystemError,
  isDustFileSystemError,
} from "@app/types/file_system";
import { Err, Ok } from "@app/types/shared/result";
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";

type WrittenFile = { content: string; contentType: string };

function makeFileSystem(): FolderExtractFileSystem & {
  writes: Map<string, WrittenFile>;
  directories: string[];
} {
  const writes = new Map<string, WrittenFile>();
  const directories: string[] = [];

  return {
    writes,
    directories,
    mkdir: async (scopedPath) => {
      directories.push(scopedPath);
      return new Ok({
        entry: {
          isDirectory: true,
          fileName: scopedPath.split("/").pop() ?? scopedPath,
          path: scopedPath,
          sizeBytes: 0,
          lastModifiedMs: 0,
        },
        nodeId: null,
      });
    },
    write: async (scopedPath, content, contentType) => {
      writes.set(scopedPath, { content: content.toString(), contentType });
      return new Ok({ nodeId: null });
    },
  };
}

function makeArchive(entries: { path: string; content?: string }[]): Buffer {
  const zip = new AdmZip();
  for (const entry of entries) {
    if (entry.content === undefined) {
      zip.addFile(
        entry.path.endsWith("/") ? entry.path : `${entry.path}/`,
        Buffer.alloc(0)
      );
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

describe("extractArchiveToFolder", () => {
  it("writes entries under the destination, preserving the archive's own root folder", async () => {
    const fileSystem = makeFileSystem();

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1/inbox",
      makeArchive([
        { path: "reports/a.txt", content: "alpha" },
        { path: "reports/nested/b.txt", content: "bravo" },
      ])
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.filesWritten).toBe(2);
    expect([...fileSystem.writes.keys()].sort()).toEqual([
      "pod-p1/inbox/reports/a.txt",
      "pod-p1/inbox/reports/nested/b.txt",
    ]);
    expect(fileSystem.writes.get("pod-p1/inbox/reports/a.txt")?.content).toBe(
      "alpha"
    );
  });

  it("creates directory entries so empty folders survive the round trip", async () => {
    const fileSystem = makeFileSystem();

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      makeArchive([
        { path: "reports/" },
        { path: "reports/empty/" },
        { path: "reports/a.txt", content: "alpha" },
      ])
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.directoriesCreated).toBe(2);
    expect(fileSystem.directories.sort()).toEqual([
      "pod-p1/reports",
      "pod-p1/reports/empty",
    ]);
  });

  it("tolerates directories that already exist at the destination", async () => {
    const fileSystem = makeFileSystem();
    fileSystem.mkdir = async () =>
      new Err(
        new DustFileSystemError(
          "already_exists",
          "A directory already exists at this path."
        )
      );

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      makeArchive([
        { path: "reports/" },
        { path: "reports/a.txt", content: "a" },
      ])
    );

    expect(result.isOk()).toBe(true);
    expect([...fileSystem.writes.keys()]).toEqual(["pod-p1/reports/a.txt"]);
  });

  it("derives the content type from the entry name", async () => {
    const fileSystem = makeFileSystem();

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      makeArchive([{ path: "notes.md", content: "# hi" }])
    );

    expect(result.isOk()).toBe(true);
    expect(fileSystem.writes.get("pod-p1/notes.md")?.contentType).toBe(
      "text/markdown"
    );
  });

  it("writes entry types the upload API would reject rather than dropping them", async () => {
    const fileSystem = makeFileSystem();

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      makeArchive([{ path: "nested.zip", content: "PK" }])
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.filesWritten).toBe(1);
    expect(fileSystem.writes.get("pod-p1/nested.zip")?.contentType).toBe(
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
    const fileSystem = makeFileSystem();

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      makeArchiveWithUnsafeEntry(
        [
          { path: "reports/a.txt", content: "alpha" },
          { path: placeholder, content: "evil" },
        ],
        placeholder,
        unsafePath
      )
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected extraction to fail.");
    }
    expect(isFolderExtractError(result.error, "unsafe_entry_path")).toBe(true);
    expect(fileSystem.writes.size).toBe(0);
  });

  it("skips archiver metadata entries", async () => {
    const fileSystem = makeFileSystem();

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      makeArchive([
        { path: "__MACOSX/._a.txt", content: "junk" },
        { path: "reports/.DS_Store", content: "junk" },
        { path: "reports/a.txt", content: "alpha" },
      ])
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.filesWritten).toBe(1);
    expect(result.value.skippedEntryCount).toBe(2);
    expect([...fileSystem.writes.keys()]).toEqual(["pod-p1/reports/a.txt"]);
  });

  it("rejects an archive with more entries than the limit", async () => {
    const fileSystem = makeFileSystem();

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      makeArchive([
        { path: "a.txt", content: "a" },
        { path: "b.txt", content: "b" },
        { path: "c.txt", content: "c" },
      ]),
      { maxEntries: 2, maxUncompressedSizeBytes: 1024 }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected extraction to fail.");
    }
    expect(isFolderExtractError(result.error, "too_many_entries")).toBe(true);
    expect(fileSystem.writes.size).toBe(0);
  });

  it("rejects an archive whose uncompressed size exceeds the limit", async () => {
    const fileSystem = makeFileSystem();

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      makeArchive([{ path: "big.txt", content: "x".repeat(2048) }]),
      { maxEntries: 10, maxUncompressedSizeBytes: 1024 }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected extraction to fail.");
    }
    expect(isFolderExtractError(result.error, "too_large")).toBe(true);
    expect(fileSystem.writes.size).toBe(0);
  });

  it("rejects a buffer that is not a ZIP archive", async () => {
    const fileSystem = makeFileSystem();

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      Buffer.from("not a zip at all")
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected extraction to fail.");
    }
    expect(isFolderExtractError(result.error, "invalid_archive")).toBe(true);
  });

  it("propagates a file system write failure", async () => {
    const fileSystem = makeFileSystem();
    fileSystem.write = async () =>
      new Err(new DustFileSystemError("unauthorized", "Read-only mount."));

    const result = await extractArchiveToFolder(
      fileSystem,
      "pod-p1",
      makeArchive([{ path: "a.txt", content: "alpha" }])
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected extraction to fail.");
    }
    expect(isDustFileSystemError(result.error, "unauthorized")).toBe(true);
  });
});
