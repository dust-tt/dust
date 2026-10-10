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
  it("keeps Frames with a linked file and images, by name", () => {
    expect(
      getDocumentEmbeddableFiles([
        file("pod-p/Zoo/Zoo.tsx", "application/vnd.dust.frame"),
        file("pod-p/Clock/Clock.tsx", "application/vnd.dust.frame", null),
        file("pod-p/chart.png", "image/png", null),
        file(
          "pod-p/Built.tsx",
          "text/plain",
          "fil_2",
          "application/vnd.dust.frame"
        ),
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
      { kind: "frame", path: "pod-p/Built.tsx", name: "Built.tsx" },
      { kind: "image", path: "pod-p/chart.png", name: "chart.png" },
      { kind: "frame", path: "pod-p/Zoo/Zoo.tsx", name: "Zoo.tsx" },
    ]);
  });
});
