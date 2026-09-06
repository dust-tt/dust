// @vitest-environment node: ZIP inspection requires Node builtins.

import { Readable } from "node:stream";
import type { FolderArchiveFileSystem } from "@app/lib/api/files/folder_archive";
import {
  planFolderArchive,
  streamFolderArchive,
} from "@app/lib/api/files/folder_archive";
import { streamToBuffer } from "@app/lib/utils/streams";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import type { FileSystemMount } from "@app/types/file_system";
import { Ok } from "@app/types/shared/result";
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";

const mount: FileSystemMount = {
  kind: "conversation",
  id: "c1",
  scopedPrefix: "conversation-c1",
  sandboxMountPoint: "/files/conversation-c1",
  legacyPrefix: "conversation",
  legacySandboxMountPoint: "/files/conversation",
  permissions: { canRead: true, canWrite: true },
};

function file(path: string, sizeBytes: number): FileSystemEntry {
  return {
    isDirectory: false,
    fileName: path.split("/").pop() ?? path,
    path,
    contentType: "text/plain",
    fileId: null,
    sizeBytes,
    lastModifiedMs: 0,
    thumbnailUrl: null,
  };
}

function directory(path: string): FileSystemEntry {
  return {
    isDirectory: true,
    fileName: path.split("/").pop() ?? path,
    path,
    sizeBytes: 0,
    lastModifiedMs: 0,
  };
}

function makeFileSystem({
  contents = new Map<string, string>(),
  entries = [],
  mounts = [mount],
  stat = null,
}: {
  contents?: Map<string, string>;
  entries?: FileSystemEntry[];
  mounts?: FileSystemMount[];
  stat?: { contentType: string; sizeBytes: number } | null;
} = {}): FolderArchiveFileSystem {
  return {
    getMounts: () => mounts,
    list: async () => new Ok(entries),
    read: async (path) =>
      new Ok(
        contents.has(path)
          ? Readable.from([Buffer.from(contents.get(path) ?? "")])
          : null
      ),
    stat: async () => new Ok(stat),
  };
}

describe("planFolderArchive", () => {
  it("plans nested files and explicit empty directories under one ZIP root", async () => {
    const folderPath = "conversation-c1/reports";
    const result = await planFolderArchive(
      makeFileSystem({
        entries: [
          directory(`${folderPath}/empty`),
          file(`${folderPath}/q1/summary.txt`, 12),
          file(`${folderPath}/readme.md`, 5),
        ],
        stat: { contentType: "application/x-directory", sizeBytes: 0 },
      }),
      folderPath
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({
      archiveFileName: "reports.zip",
      directories: ["reports/", "reports/empty/"],
      files: [
        {
          archivePath: "reports/q1/summary.txt",
          canonicalPath: "conversation-c1/reports/q1/summary.txt",
          sizeBytes: 12,
        },
        {
          archivePath: "reports/readme.md",
          canonicalPath: "conversation-c1/reports/readme.md",
          sizeBytes: 5,
        },
      ],
      totalSizeBytes: 17,
    });
  });

  it("allows an empty mount root", async () => {
    const result = await planFolderArchive(makeFileSystem(), "conversation-c1");

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.directories).toEqual(["conversation-c1/"]);
    expect(result.value.files).toEqual([]);
  });

  it("rejects a file path", async () => {
    const result = await planFolderArchive(
      makeFileSystem({
        stat: { contentType: "text/plain", sizeBytes: 4 },
      }),
      "conversation-c1/report.txt"
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected a non-directory error.");
    }
    expect(result.error).toMatchObject({ code: "not_directory" });
  });

  it("rejects a missing inferred folder", async () => {
    const result = await planFolderArchive(
      makeFileSystem(),
      "conversation-c1/missing"
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected a missing-folder error.");
    }
    expect(result.error).toMatchObject({ code: "not_found" });
  });

  it("rejects folders over the entry limit", async () => {
    const result = await planFolderArchive(
      makeFileSystem({
        entries: [
          file("conversation-c1/reports/a.txt", 1),
          file("conversation-c1/reports/b.txt", 1),
        ],
      }),
      "conversation-c1/reports",
      { maxEntries: 1, maxSizeBytes: 100 }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an entry-limit error.");
    }
    expect(result.error).toMatchObject({ code: "too_many_entries" });
  });

  it("rejects folders over the uncompressed byte limit", async () => {
    const result = await planFolderArchive(
      makeFileSystem({
        entries: [file("conversation-c1/reports/large.txt", 101)],
      }),
      "conversation-c1/reports",
      { maxEntries: 10, maxSizeBytes: 100 }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected a byte-limit error.");
    }
    expect(result.error).toMatchObject({ code: "too_large" });
  });
});

describe("streamFolderArchive", () => {
  it("streams readable files into a valid ZIP without opening them concurrently", async () => {
    const folderPath = "conversation-c1/reports";
    const contents = new Map([
      [`${folderPath}/a.txt`, "alpha"],
      [`${folderPath}/nested/b.txt`, "bravo"],
    ]);
    let activeReads = 0;
    let maxActiveReads = 0;
    const fileSystem = makeFileSystem({ contents });
    fileSystem.read = async (path) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      const content = contents.get(path);
      const stream = Readable.from(
        (async function* () {
          yield Buffer.from(content ?? "");
          activeReads -= 1;
        })()
      );
      return new Ok(stream);
    };

    const result = await streamToBuffer(
      streamFolderArchive(fileSystem, {
        archiveFileName: "reports.zip",
        directories: ["reports/", "reports/empty/"],
        files: [
          {
            archivePath: "reports/a.txt",
            canonicalPath: `${folderPath}/a.txt`,
            sizeBytes: 5,
          },
          {
            archivePath: "reports/nested/b.txt",
            canonicalPath: `${folderPath}/nested/b.txt`,
            sizeBytes: 5,
          },
        ],
        totalSizeBytes: 10,
      })
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error);
    }
    const zip = new AdmZip(result.value);
    expect(zip.getEntries().map((entry) => entry.entryName)).toEqual([
      "reports/",
      "reports/empty/",
      "reports/a.txt",
      "reports/nested/b.txt",
    ]);
    expect(zip.readAsText("reports/a.txt")).toBe("alpha");
    expect(zip.readAsText("reports/nested/b.txt")).toBe("bravo");
    expect(maxActiveReads).toBe(1);
  });
});
