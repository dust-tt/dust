import { getDocumentEmbeddableFiles } from "@app/components/file_explorer/useDocumentEmbeddableFiles";
import { FileSystemEntryFactory } from "@app/tests/utils/FileSystemEntryFactory";
import { describe, expect, it } from "vitest";

describe("getDocumentEmbeddableFiles", () => {
  it("keeps Frames with a linked file and images, by the linked file's type, sorted by name", () => {
    expect(
      getDocumentEmbeddableFiles([
        FileSystemEntryFactory.file({
          path: "pod-p/Zoo/Zoo.tsx",
          contentType: "application/vnd.dust.frame",
        }),
        FileSystemEntryFactory.file({
          path: "pod-p/Clock/Clock.tsx",
          contentType: "application/vnd.dust.frame",
          fileId: null,
        }),
        FileSystemEntryFactory.file({
          path: "pod-p/chart.png",
          contentType: "image/png",
          fileId: null,
        }),
        FileSystemEntryFactory.file({
          path: "pod-p/Built.tsx",
          contentType: "text/plain",
          fileResourceContentType: "application/vnd.dust.frame",
        }),
        FileSystemEntryFactory.file({
          path: "pod-p/Built.bin",
          fileResourceContentType: "image/png",
        }),
        FileSystemEntryFactory.file({
          path: "pod-p/notes.md",
          contentType: "text/markdown",
        }),
        FileSystemEntryFactory.directory({ path: "pod-p/dir" }),
      ])
    ).toEqual([
      { kind: "image", path: "pod-p/Built.bin", name: "Built.bin" },
      { kind: "frame", path: "pod-p/Built.tsx", name: "Built.tsx" },
      { kind: "image", path: "pod-p/chart.png", name: "chart.png" },
      { kind: "frame", path: "pod-p/Zoo/Zoo.tsx", name: "Zoo.tsx" },
    ]);
  });
});
