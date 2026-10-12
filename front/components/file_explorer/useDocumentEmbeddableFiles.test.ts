import { getDocumentEmbeddableFiles } from "@app/components/file_explorer/useDocumentEmbeddableFiles";
import { FileSystemEntryFactory } from "@app/tests/utils/FileSystemEntryFactory";
import { describe, expect, it } from "vitest";

describe("getDocumentEmbeddableFiles", () => {
  it("keeps images, by the linked file's type, sorted by name", () => {
    expect(
      getDocumentEmbeddableFiles([
        FileSystemEntryFactory.file({
          path: "pod-p/zoo.png",
          contentType: "image/png",
          fileId: null,
        }),
        FileSystemEntryFactory.file({
          path: "pod-p/charts/q3.jpg",
          contentType: "image/jpeg",
        }),
        FileSystemEntryFactory.file({
          path: "pod-p/Built.bin",
          fileResourceContentType: "image/png",
        }),
        FileSystemEntryFactory.file({
          path: "pod-p/Clock/Clock.tsx",
          contentType: "application/vnd.dust.frame",
        }),
        FileSystemEntryFactory.file({
          path: "pod-p/notes.md",
          contentType: "text/markdown",
        }),
        FileSystemEntryFactory.directory({ path: "pod-p/dir" }),
      ])
    ).toEqual([
      { kind: "image", path: "pod-p/Built.bin", name: "Built.bin" },
      { kind: "image", path: "pod-p/charts/q3.jpg", name: "q3.jpg" },
      { kind: "image", path: "pod-p/zoo.png", name: "zoo.png" },
    ]);
  });
});
