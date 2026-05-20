import type { FileEntry } from "@app/components/file_explorer/types";
import { isFileExplorerMovableFile } from "@app/components/file_explorer/utils";
import { frameContentType, frameSlideshowContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

function makeFileEntry(contentType: string): FileEntry {
  return {
    kind: "file",
    path: "project/foo.txt",
    fileName: "foo.txt",
    contentType,
    fileId: "file-1",
    isDirectory: false,
    lastModifiedMs: 0,
    sizeBytes: 0,
    thumbnailUrl: null,
  };
}

describe("isFileExplorerMovableFile", () => {
  it("returns false for fileId-backed frames and slideshows", () => {
    expect(isFileExplorerMovableFile(makeFileEntry(frameContentType))).toBe(
      false
    );
    expect(
      isFileExplorerMovableFile(makeFileEntry(frameSlideshowContentType))
    ).toBe(false);
  });

  it("returns true for mount-addressed files with a fileId", () => {
    expect(isFileExplorerMovableFile(makeFileEntry("text/plain"))).toBe(true);
  });

  it("returns true for path-only files without a fileId", () => {
    expect(
      isFileExplorerMovableFile({
        ...makeFileEntry("text/plain"),
        fileId: null,
      })
    ).toBe(true);
  });
});
