import { getDocumentEmbeddableFiles } from "@app/components/file_explorer/useDocumentEmbeddableFiles";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import { describe, expect, it } from "vitest";

const file = (
  path: string,
  contentType: string,
  fileId: string | null = "fil_1",
  fileResourceContentType?: string
): FileSystemEntry => ({
  isDirectory: false,
  fileName: path.slice(path.lastIndexOf("/") + 1),
  path,
  sizeBytes: 1,
  lastModifiedMs: 0,
  contentType,
  fileId,
  fileResourceContentType,
  thumbnailUrl: null,
});

describe("getDocumentEmbeddableFiles", () => {
  it("keeps images, by the linked file's type, sorted by name", () => {
    expect(
      getDocumentEmbeddableFiles([
        file("pod-p/zoo.png", "image/png", null),
        file("pod-p/charts/q3.jpg", "image/jpeg"),
        file(
          "pod-p/Built.bin",
          "application/octet-stream",
          "fil_2",
          "image/png"
        ),
        file("pod-p/Clock/Clock.tsx", "application/vnd.dust.frame"),
        file("pod-p/notes.md", "text/markdown"),
        {
          isDirectory: true,
          fileName: "dir",
          path: "pod-p/dir",
          sizeBytes: 0,
          lastModifiedMs: 0,
        },
      ])
    ).toEqual([
      { kind: "image", path: "pod-p/Built.bin", name: "Built.bin" },
      { kind: "image", path: "pod-p/charts/q3.jpg", name: "q3.jpg" },
      { kind: "image", path: "pod-p/zoo.png", name: "zoo.png" },
    ]);
  });
});
